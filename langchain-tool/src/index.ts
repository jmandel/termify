import { BasePromptTemplate, LLMChain } from "langchain";
import { BaseLanguageModel } from "langchain/base_language";
import { BaseChain, SerializedBaseChain } from "langchain/chains";

import { BaseMemory } from "langchain/memory";
import { prompt, refinementPrompt } from "./prompt.js";

import { ChatOpenAI } from "langchain/chat_models";
import { BaseOutputParser, ChainValues } from "langchain/schema";

const defaultPrompt = prompt;

class CodingsParser extends BaseOutputParser {
  async parse(input: string): Promise<Record<string, any>[]> {
    console.log("COdings in ", input)
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

    return jsonObjects as Record<string, any>[];
  }

  getFormatInstructions(): string {
    return "";
  }
}

export class HealthcareConceptChain extends BaseChain {
  _chainType(): string {
    return `healthcare-concept-chain`;
  }
  serialize(): SerializedBaseChain {
    throw new Error("Method not implemented.");
  }

  llmChain: LLMChain;
  refinementChain: BaseChain;
  txEndpoint: string = "https://vocab-tool.fly.dev/$lookup-code";

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
      outputParser: new CodingsParser(),
      prompt: fields.prompt ?? defaultPrompt,
      llm: fields.llm,
      outputKey: this.outputKey,
      //   memory: this.memory,
    });

    this.refinementChain = new HealthcareConceptRefineChain({llm, txEndpoint: this.txEndpoint})

    this.txEndpoint = fields.txEndpoint ?? this.txEndpoint;
    this.inputKey = fields.inputKey ?? this.inputKey;
    this.outputKey = fields.outputKey ?? this.outputKey;
  }

  async _call(values: ChainValues): Promise<ChainValues> {
    if (!(this.inputKey in values)) {
      throw new Error(`Question key ${this.inputKey} not found.`);
    }

    const clinicalText: string = values[this.inputKey];

    const codings = await this.llmChain.predict({ clinicalText }) as unknown as any[];
    for (const c of codings) {
      const refinement = await this.refinementChain.call(c)
      c.bestCoding = refinement.bestCoding;
    }
    return { [this.outputKey]: codings };
  }

  get inputKeys(): string[] {
    return [this.inputKey];
  }
}


export class HealthcareConceptRefineChain extends BaseChain {
  _chainType(): string {
    return `healthcare-concept-refinement-chain`;
  }
  serialize(): SerializedBaseChain {
    throw new Error("Method not implemented.");
  }

  llmChain: LLMChain;
  txEndpoint: string = "httsp://vocab-tool.fly.dev/$lookup-code";

  constructor(fields: {
    llm: BaseLanguageModel;
    txEndpoint?: string;
  }) {
    super();
    this.llmChain = new LLMChain({
      outputParser: new CodingsParser(),
      prompt: refinementPrompt,
      llm: fields.llm,
    });

    this.txEndpoint = fields.txEndpoint ?? this.txEndpoint;
  }

  async _call(values: ChainValues): Promise<ChainValues> {
    const {originalText, focus, system, query} = values;
    const vocabQuery = await fetch(`${this.txEndpoint}?system=${encodeURIComponent(system)}&display=${encodeURIComponent(JSON.stringify(query))}`);
    const vocabResult = await vocabQuery.json();
    console.log("VR", JSON.stringify(vocabResult, null, 2))
    const codings = await this.llmChain.predict({originalText, focus: focus || originalText, system, resultJson: JSON.stringify(vocabResult, null, 2)});
    return { bestCoding: codings[0] };
  }

  get inputKeys(): string[] {
    return ["originalText", "focus", "system", "display"];
  }
}

const q = process.argv[2];
let llm = new ChatOpenAI({ temperature: 0, concurrency: 3});
const hcc = new HealthcareConceptChain({ llm });
const res = await hcc.call({
  clinicalText: q,
});
console.log(JSON.stringify(res, null, 2));
