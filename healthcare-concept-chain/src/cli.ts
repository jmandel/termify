import { HealthcareConceptChain } from "healthcare-chain.js";
import { ChatOpenAI } from "langchain/chat_models";

const q = process.argv[2];
console.log("Q", q)
let llm = new ChatOpenAI({ temperature: 0, concurrency: 3 });
const hcc = new HealthcareConceptChain({ llm });

const res = await hcc.call({
  clinicalText: q,
});

console.log("Final");
console.log(JSON.stringify(res, null, 2));