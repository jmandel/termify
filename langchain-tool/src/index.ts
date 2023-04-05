import { BasePromptTemplate, LLMChain } from "langchain";
import { BaseLanguageModel } from "langchain/base_language";
import { BaseChain, SerializedBaseChain } from "langchain/chains";

import { BaseMemory } from "langchain/memory";
import {
  initialPrompt,
  refinementPrompt,
} from "./prompt.js";

import { ChatOpenAI } from "langchain/chat_models";
import { BaseOutputParser, ChainValues } from "langchain/schema";
import { RegexParser } from "langchain/output_parsers";

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
  refinementChain: BaseChain;
  // txEndpoint: string = "https://vocab-tool.fly.dev/$lookup-code";
  txEndpoint: string = "http://localhost:8000/$lookup-code";

  inputKey = "clinicalText";
  outputKey = "result";

  constructor(fields: {
    llm: BaseLanguageModel;
    txEndpoint?: string;
    inputKey?: string;
    outputKey?: string;
    memory?: BaseMemory;
    prompt?: BasePromptTemplate;
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
      llm,
      txEndpoint: this.txEndpoint,
    });

    this.txEndpoint = fields.txEndpoint ?? this.txEndpoint;
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

    for (const c of codings) {
      const refinement = await this.refinementChain.call(c);
      c.bestCoding = refinement?.bestCoding;
      c.score = refinement?.score;
    }
    return { [this.outputKey]: codings };
  }

  get inputKeys(): string[] {
    return [this.inputKey];
  }
}
interface VocabResult {
  codings: Record<string, any>[];
  grade?: string;
  rationale?: string;
  newQuerySystem: string;
  newQuery: string;
}
export class HealthcareConceptRefineChain extends BaseChain {
  _chainType(): string {
    return `healthcare-concept-refinement-chain`;
  }
  serialize(): SerializedBaseChain {
    throw new Error("Method not implemented.");
  }

  llmChain: LLMChain;
  txEndpoint: string;
  maxAttemptsBeforeFailure: number = 5;

  constructor(fields: { llm: BaseLanguageModel; txEndpoint?: string }) {
    super();
    this.llmChain = new LLMChain({
      outputParser: new MultiOutputParser(
        new CodingsParser("codings"),
        new RegexParser(/Final Grade: (A|B|C)/i, ["grade"], "noGrade"),
        new RegexParser(/Justification: (.*)/i, ["rationale"], "noRationale"),
        new RegexParser(
          /New Query: \?system=(\S+)&display=(\S+)/i,
          ["newQuerySystem", "newQuery"],
          "noQuery"
        )
      ),
      prompt: refinementPrompt,
      llm: fields.llm,
    });

    this.txEndpoint = fields.txEndpoint ?? this.txEndpoint;
  }

  async _call(values: ChainValues): Promise<ChainValues> {
    let { originalText, focus, system, query } = values;
    let { failures = [] } = values;

    while (failures.length < this.maxAttemptsBeforeFailure) {

      const vocabQuery = await fetch(
        `${this.txEndpoint}?system=${encodeURIComponent(
          system
        )}&display=${encodeURIComponent(JSON.stringify(query))}`
      );
      const vocabResult = await vocabQuery.json();

      const prediction = (await this.llmChain.predict({
        originalText,
        focus: focus || originalText,
        system,
        query,
        failures,
        resultJson: JSON.stringify(vocabResult, null, 2),
      })) as unknown as VocabResult;

      console.log("PREDICT", prediction);

      const { codings, grade, rationale, newQuerySystem, newQuery } =
        prediction;

      if (
        vocabResult.results.some(
          (c) => c.code === codings?.[0]?.code && ["A", "B"].includes(grade)
        )
      ) {
        // console.log("Success");
        return { bestCoding: codings[0], score: { grade, rationale } };
      }
      // console.log(
      //   "Failed b/c",
      //   vocabResult.results.some((c) => c.code === codings?.[0]?.code),
      //   "and",
      //   ["A", "B"].includes(grade)
      // );

      failures.push({
        ...values,
        system,
        query,
        failures: undefined,
        rationale: "No suitable results found",
      });
      if (newQuerySystem && newQuery) {
        system = newQuerySystem;
      }
      continue;
    }
    return {}
  }

  get inputKeys(): string[] {
    return ["originalText", "focus", "system", "display"];
  }
}

const q = process.argv[2];
let llm = new ChatOpenAI({ temperature: 0, concurrency: 3 });
// let pfam = await fnToPrompt(jokes).partial({"given": "Zena"})
// const lpp = new LLMChain({ llm, prompt: templatize(jokes) });

// console.log(await lpp.call({"family": "Smith"}))

const hcc = new HealthcareConceptChain({ llm });
const res = await hcc.call({
  clinicalText: q,
});

console.log("Final");
console.log(JSON.stringify(res, null, 2));
