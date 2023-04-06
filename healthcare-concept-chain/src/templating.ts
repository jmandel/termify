import { BasePromptTemplate, LLMChain } from "langchain";
import { BaseChatModel, ChatOpenAI } from "langchain/chat_models";
import { SerializedBasePromptTemplate } from "langchain/prompts";
import {
  AIChatMessage,
  BaseChatMessage,
  BasePromptValue,
  HumanChatMessage,
  InputValues,
  PartialValues,
  SystemChatMessage,
} from "langchain/schema";

class MessageBackededPromptValue extends BasePromptValue {
  constructor(public messages: BaseChatMessage[]) {
    super();
  }
  toString(): string {
    return this.messages.map((m) => `${m._getType}: ${m.text}`).join("\n\n");
  }
  toChatMessages(): BaseChatMessage[] {
    return this.messages;
  }
}

class FnBackedPromptTemplate extends BasePromptTemplate {
  constructor(
    public fn: (values: InputValues) => Promise<BaseChatMessage[]>,
    partials?: PartialValues
  ) {
    super({
      inputVariables: [],
      outputParser: undefined,
      partialVariables: partials,
    });
  }

  async partial(values: PartialValues): Promise<BasePromptTemplate> {
    return new FnBackedPromptTemplate(this.fn, values);
  }

  async format(values: InputValues): Promise<string> {
    return (await this.formatPromptValue(values)).toString();
  }

  async formatPromptValue(values: InputValues): Promise<BasePromptValue> {
    const ret = new MessageBackededPromptValue(
      await this.fn({ ...(this.partialVariables || {}), ...values })
    );
    return ret;
  }

  _getPromptType(): string {
    return "fn-backed-prompt-template";
  }

  serialize(): SerializedBasePromptTemplate {
    throw new Error("Method not implemented.");
  }
}

export function templatize(
  fn: (state: InputValues) => Promise<BaseChatMessage[]>
) {
  return new FnBackedPromptTemplate(fn);
}

export function fnToChain(
  fn: (state: InputValues) => Promise<BaseChatMessage[]>,
  llm?: BaseChatModel
) {
  let prompt = templatize(fn);
  return new LLMChain({
    llm: llm ?? new ChatOpenAI({ temperature: 0 }),
    prompt,
  });
}
export function llmify(fn: (state: InputValues) => Promise<BaseChatMessage[]>) {
  let chain = fnToChain(fn);
  return async (inputs) => {
    let ret = await chain.call(inputs);
    return ret.text;
  };
}

async function randomNumbers(min = 100, max = 1000) {
  let random = await fetch(
    `https://www.randomnumberapi.com/api/v1.0/random?min=${min}&max=${max}&count=5`
  );
  return random.text();
}

interface PersonState {
  firstName: string;
  familyName: string;
}

export const ai = (s: string) => new AIChatMessage(s);
export const human = (s: string) => new HumanChatMessage(s);
export const system = (s: string) => new SystemChatMessage(s);

const banter = async (state: PersonState) => [
  system(
    `You are a droll and delightful conversationalist. You always make jokes when the user asks.`
  ),
  human("Do you know some random numbers?"),
  ai(`Sure, I know ${await randomNumbers(100, 100 * state.firstName.length)}`),
  human(
    "Please invoke your famous conversational skills to count them, then come up with a witty reference using this count."
  ),
];

export const jokes = async (state: PersonState) => [
  system(`You are a droll and delightful conversationalist.`),
  human(`Hi there, I'm ${state.firstName}.`),
  ...(await banter(state)),
  ai(
    `Hello ${state.firstName}, what a lovely name.
    I bet your last name is ${state.familyName}, which is ${
      state.familyName.length
    } letters long.
    ${
      state.firstName.startsWith("A")
        ? "My favorite names start wiht A."
        : state.firstName.startsWith("Z")
        ? "How bold, the Zed at the start of your name."
        : ""
    }
   `
  ),
  ai(await llmify(banter)(state)),
  human(`So tell me a joke, incorporating specific detalis from our banter.`),
];

