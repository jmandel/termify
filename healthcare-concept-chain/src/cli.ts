import { HealthcareConceptChain } from "healthcare-chain.js";
import { BaseCallbackHandler, CallbackManager } from "langchain/callbacks";
import { ChatOpenAI } from "langchain/chat_models";


class WeblogCallbackHandler extends BaseCallbackHandler {
  constructor() {
    super()
  }
  async handleLLMStart(_llm: { name: string; }, prompts: string[], _verbose?: boolean){
    console.error(prompts[0])
    report.steps.push({input: prompts[0]});
  }
  async handleLLMEnd(output: LLMResult, _verbose?: boolean) {
    console.error( output.generations[0][0].text)
    report.steps.slice(-1)[0].output = output.generations[0][0].text
  }
  async handleText(text: string, _verbose?: boolean) {
    console.error(JSON.stringify(text, null, 2))
    report.steps.slice(-1)[0].parsed = JSON.parse(JSON.stringify(text));
  }
}

const callbackManager = new CallbackManager();
callbackManager.addHandler(new WeblogCallbackHandler());
const q = process.argv[2];
const s = process.argv[3];

const report: Record<string, any> = {
  input: q,
  steps: []
};

// console.log("Q", q);
let llm = new ChatOpenAI({ temperature: 0.3, concurrency: 3, callbackManager});
const hcc = new HealthcareConceptChain({ llm: llm, txStrategy: s });

const res = await hcc.call({
  clinicalText: q,
});


report.strategy = s;
report.plan = report.steps[0].parsed;
report.result = res.result;
console.log(JSON.stringify(report, null, 2))

// const codings = {
//     "codings": [
//       {
//         "originalText": "must stop coumadin before repair of inguinal hernia",
//         "focus": "repair",
//         "thoughts": "Use SNOMED for surgical repair of inguinal hernia",
//         "codes": [
//          {
//             "system": "http://snomed.info/sct",
//             "display": "Repair of inguinal hernia, open approach (procedure)"
//           } ,
//           {
//             "system": "http://snomed.info/sct",
//             "display": "Surgical procedure (procedure)"
//           }
//         ]
//       }
//     ]
//   }.codings as any;

//     for (const c of codings) {
//       const refinement = await hcc.refinementChain.call(c);
//       c.coding = refinement?.coding;
//       c.selfAssessment = {...refinement, coding: undefined}
//       delete c.codes
//       console.log("MAPPED TP", c)
//     }
 
