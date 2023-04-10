import { BasePromptTemplate, LLMChain } from "langchain";
import { BaseLanguageModel } from "langchain/base_language";
import { BaseChain, SerializedBaseChain } from "langchain/chains";

import { BaseMemory } from "langchain/memory";
import { initialPrompt, refinementPrompt } from "./prompt.js";

import { RegexParser } from "langchain/output_parsers";
import { BaseOutputParser, ChainValues } from "langchain/schema";

export class MultiOutputParser extends BaseOutputParser {
  parsers: BaseOutputParser[];
  constructor(...parsers) {
    super();
    this.parsers = parsers;
  }

  async parse(input: string): Promise<Record<string, any>> {
    let ret = {};
    for (const p of this.parsers) {
      ret = { ...ret, ...((await p.parse(input)) as Record<string, any>) };
    }
    return ret;
  }

  getFormatInstructions(): string {
    return this.parsers.map((p) => p.getFormatInstructions()).join("\n");
  }
}

class CodingsParser extends BaseOutputParser {
  constructor(public outputKey: string) {
    super();
  }
  async parse(input: string): Promise<Record<string, any>> {
    const jsonObjects: any[] = [];
    let jsonString = "";

    for (let i = 0; i < input.length; i++) {
      if (input[i] === "{") {
        jsonString = "";
        let braceCount = 1;
        jsonString += input[i];

        for (let j = i + 1; j < input.length; j++) {
          if (input[j] === "{") {
            braceCount++;
          } else if (input[j] === "}") {
            braceCount--;
          }

          jsonString += input[j];

          if (braceCount === 0) {
            try {
              const jsonObj = JSON.parse(jsonString);
              jsonObjects.push(jsonObj);
            } catch (error) {}

            i = j;
            break;
          }
        }
      }
    }

    return { [this.outputKey]: jsonObjects };
  }

  getFormatInstructions(): string {
    return "";
  }
}

const defaultPrompt = initialPrompt;
export class HealthcareConceptChain extends BaseChain {
  _chainType(): string {
    return `healthcare-concept-chain`;
  }
  serialize(): SerializedBaseChain {
    throw new Error("Method not implemented.");
  }

  llmChain: LLMChain;
  job?: string;
  refinementChain: BaseChain;
  txEndpoint: string = "https://vocab-tool.fly.dev/$lookup-code";
  // txEndpoint: string = "http://localhost:8000/$lookup-code";

  inputKey = "clinicalText";
  outputKey = "result";

  constructor(fields: {
    llm: BaseLanguageModel;
    txEndpoint?: string;
    inputKey?: string;
    outputKey?: string;
    memory?: BaseMemory;
    prompt?: BasePromptTemplate;
    job?: string;
  }) {
    const { memory } = fields;
    super(memory);
    this.llmChain = new LLMChain({
      outputParser: new CodingsParser("codings"),
      prompt: fields.prompt ?? defaultPrompt,
      llm: fields.llm,
      outputKey: this.outputKey,
      //   memory: this.memory,
    });

    this.refinementChain = new HealthcareConceptRefineChain({
      llm: fields.llm,
      txEndpoint: this.txEndpoint,
      job: this.job,
    });

    this.txEndpoint = fields.txEndpoint ?? this.txEndpoint;
    this.job = fields.job ?? this.job;
    this.inputKey = fields.inputKey ?? this.inputKey;
    this.outputKey = fields.outputKey ?? this.outputKey;
  }

  async _call(values: ChainValues): Promise<ChainValues> {
    if (!(this.inputKey in values)) {
      throw new Error(`Question key ${this.inputKey} not found.`);
    }

    const clinicalText: string = values[this.inputKey];

    const { codings } = (await this.llmChain.predict({
      clinicalText,
    })) as unknown as {
      codings: Record<string, any>[];
    };

    this.llmChain.llm.callbackManager?.handleText(
      {
        codings,
      } as unknown as string,
      true
    );

    for (const c of codings) {
      const refinement = await this.refinementChain.call(c);
      c.coding = refinement?.coding;
      c.selfAssessment = {...refinement, coding: undefined}
      delete c.codes
    }
    return { [this.outputKey]: codings };
  }

  get inputKeys(): string[] {
    return [this.inputKey];
  }
}
interface VocabResult {
  codings: Record<string, any>[];
  action?: string;
  grade?: string;
  rationale?: string;
}
export class HealthcareConceptRefineChain extends BaseChain {
  _chainType(): string {
    return `healthcare-concept-refinement-chain`;
  }
  serialize(): SerializedBaseChain {
    throw new Error("Method not implemented.");
  }

  job?: string;
  llmChain: LLMChain;
  txEndpoint: string;
  maxAttemptsBeforeFailure: number = 5;

  constructor(fields: {
    llm: BaseLanguageModel;
    txEndpoint?: string;
    job?: string;
  }) {
    super();
    this.llmChain = new LLMChain({
      outputParser: new MultiOutputParser(
        new CodingsParser("codings"),
        new RegexParser(/Final Recommendation: (.*)/i, ["action"], "noAction"),
        new RegexParser(/Final Grade: (A|B|C)/i, ["grade"], "noGrade"),
        new RegexParser(/Evaluation: (.*)/i, ["rationale"], "noRationale"),
      ),
      prompt: refinementPrompt,
      llm: fields.llm,
    });

    this.txEndpoint = fields.txEndpoint ?? this.txEndpoint;
    this.job = fields.job ?? this.job;
  }

  async _call(values: ChainValues): Promise<ChainValues> {
    let { originalText, focus, thoughts, codes } = values;
    let { failures = [] } = values;

    let codeIndex = 0;
    const previousCandidates = [];
    while (failures.length < this.maxAttemptsBeforeFailure && codeIndex < codes.length) {
      const coding = codes[codeIndex++];

      const vocabQuery = await fetch(
        `${this.txEndpoint}?system=${encodeURIComponent(
          coding.system
        )}&display=${encodeURIComponent(JSON.stringify(coding.display))}`
      );

      let vocabResult;

      try {
        vocabResult = await vocabQuery.text();
        vocabResult = JSON.parse(vocabResult);
      } catch (e) {
        console.error("Failed to parse vocab result", e, system, display, vocabResult);
      }

      console.log("NEW PRED", previousCandidates)
      const prediction = (await this.llmChain.predict({
        originalText,
        focus: focus || originalText,
        thoughts,
        failures,
        resultJson: vocabResult,
        previousCandidates
      })) as unknown as VocabResult;

      const { codings, grade, action  } = prediction;
    
      const matchingResult = vocabResult?.results?.find(
        (c) => c.code === codings?.[0]?.code
      );

      const usedRealResultDisplay = matchingResult?.display === codings?.[0]?.display;
      this.llmChain.llm.callbackManager?.handleText(
        {
          ...prediction,
          usedRealResultCode: !!matchingResult,
          usedRealResultDisplay:
            matchingResult && usedRealResultDisplay
        } as unknown as string,
        true
      );

      if (grade === "A" && matchingResult && usedRealResultDisplay) {
        previousCandidates.push({
            grade,
            action,
            coding: codings[0]
        })
      }

      if (!action.startsWith("Use")) {
        failures.push({
            ...values,
            failures: undefined,
            rationale: "No suitable results found"
        });
      }
    }

    return previousCandidates.slice(-1)[0];
  }

  get inputKeys(): string[] {
    return ["originalText", "focus", "system", "display"];
  }
}
