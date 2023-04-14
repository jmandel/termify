import fs from "fs";
import { ChatOpenAI } from "langchain/chat_models";
import { BaseChatMessage } from "langchain/schema";
import { ai, human, system } from "./templating.js";

import { BaseCallbackHandler, CallbackManager } from "langchain/callbacks";

// const report = {
//   steps: [],
// };
// class WeblogCallbackHandler extends BaseCallbackHandler {
//   constructor() {
//     super();
//   }
//   async handleLLMStart(
//     _llm: { name: string },
//     prompts: string[],
//     _verbose?: boolean
//   ) {
//     console.error(prompts[0]);
//     report.steps.push({ input: prompts[0] });
//   }
//   async handleLLMEnd(output: LLMResult, _verbose?: boolean) {
//     console.error(output.generations[0][0].text);
//     report.steps.slice(-1)[0].output = output.generations[0][0].text;
//   }
//   async handleText(text: string, _verbose?: boolean) {
//     console.error(JSON.stringify(text, null, 2));
//     report.steps.slice(-1)[0].parsed = JSON.parse(JSON.stringify(text));
//   }
// }
// const callbackManager = new CallbackManager();
// callbackManager.addHandler(new WeblogCallbackHandler());

type Role = "human" | "ai" | "system";
interface PState {
  order?: ["for" | "against", "for" | "against"];
  proposition: {
    role?: Role;
    statement: string;
  };
  for?: {
    role?: Role;
    argument: string;
  };
  against?: {
    role?: Role;
    argument: string;
  };
}

const roleFor = (r: Role): ((s: string) => BaseChatMessage) =>
  r === "human" ? human : r === "ai" ? ai : system;

const consider = (state) =>
  `You will consider the following proposition: ${state.proposition.statement}.`;

const decideFor = async (state: PState) => [
  roleFor(state.proposition.role)(consider(state)),
  roleFor(state.proposition.role)(
    `Please make a compelling argument on behalf of this proposition, in two sentences or less.`
  ),
];

const decideAgainst = async (state: PState) => [
  roleFor(state.proposition.role)(consider(state)),
  roleFor(state.proposition.role)(
    `Please make a compelling argument against this proposition, in two sentences or less.`
  ),
];

const argumentFor = (state: PState) =>
  roleFor(state.for.role)(`FOR: ${state.for.argument}`);

const argumentAgainst = (state: PState) =>
  roleFor(state.against.role)(`AGAINST: ${state.against.argument}`);

const judge = async (state: PState) => [
  roleFor(state.proposition.role)(
    `${consider(state)} 

Then read each argument and decide which argument is more compelling. Output the first word of the best argument. Just the single word that appears before ":" of your preferred argument. Do not output punctuation or commentary.`),
  state.order[0] === "for" ? argumentFor(state) : argumentAgainst(state),
  state.order[1] === "for" ? argumentFor(state) : argumentAgainst(state),
];

const pets = `Pet ownership is unethical`;
const petsFor = "Pet ownership is unethical because it involves the exploitation of animals for human pleasure and convenience, and often results in neglect, abuse, and abandonment. Additionally, the breeding and buying of pets contributes to the overpopulation of animals in shelters and the euthanasia of millions of healthy animals each year.";
const petsAgainst = "Pet ownership can be ethical if done responsibly and with the animal's well-being in mind. Many pets are rescued from abusive or neglectful situations and are given a better life with loving owners.";

const socialMedia = `Social media platforms should be held accountable for the content their users post`;
const socialMediaFor = `Holding platforms accountable promotes a safer online environment and reduces the spread of harmful content.`;
const socialMediaAgainst = `This could infringe on freedom of speech and lead to over-censorship, potentially stifling open discussion.`;

const colors = {
    proposition:  "Grass is blue.",
    for:  "I took a photo of grass and I think I remember it being blue.",
    against:  "If you look at grass it's obviously green, which is not blue.",
};

const cds = {
    proposition: "Implementing clinical decision support tools is unlikely to reduce medical errors.",
    for: "Overreliance on clinical decision support tools may hinder clinical judgment and lead to alert fatigue.",
    against: "Clinical decision support tools can help providers make evidence-based decisions and reduce the risk of errors.",
}

const chatModelForArguments = new ChatOpenAI({ temperature: 0 });
const chatModelForJudgments = new ChatOpenAI({
  temperature: 1.0,
  maxTokens: 10,
  //   callbackManager,
});

const prep = (v: {proposition: string, for: string, against: string}): PState => ({
    proposition: {statement: v.proposition}, for: {argument: v.for}, against: {argument: v.against}
})
const state = prep(cds);

const log = [];
const SAMPLES = 1;
for (const order of [ ["for", "against"], ["against", "for"] ]) {
  for (const propositionRole of ["human", "ai", "system"]) {
    for (const forRole of ["human", "ai", "system"]) {
      for (const againstRole of ["human", "ai", "system"]) {
        state.proposition.role = propositionRole as Role;
        state.order = order as any;
        state.for.role = forRole as Role;
        state.against.role = againstRole as Role;
        for (const _i of [...Array(SAMPLES).keys()]) {
          const prompt = await judge(state);
          const judgment = (await chatModelForJudgments.call(prompt)).text;
          const output = {
            state,
            judgment,
            messages: prompt.map(p => ({content: p.text, role: p._getType()})),
          };
          log.push(output);
          console.log(JSON.stringify(output));
        }
      }
    }
  }
}

fs.writeFileSync("log.json", JSON.stringify(log, null, 2));
