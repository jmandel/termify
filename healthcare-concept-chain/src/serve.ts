import { randomUUID } from "crypto";
import express from "express";
import { HealthcareConceptChain } from "healthcare-chain.js";
import { BaseCallbackHandler, CallbackManager } from "langchain/callbacks";
import { ChatOpenAI } from "langchain/chat_models";
import { LLMResult } from "langchain/schema";
const app = express();

class WeblogCallbackHandler extends BaseCallbackHandler {
  constructor(public job: string) {
    super()
  }
  async handleLLMStart(_llm: { name: string; }, prompts: string[], _verbose?: boolean): Promise<void> {
    reportProgress(this.job, prompts[0]);
  }
  async handleLLMEnd(output: LLMResult, _verbose?: boolean) {
    reportProgress(this.job, JSON.stringify(output.generations[0][0].text, null, 2));
  }
  async handleText(text: string, _verbose?: boolean) {
    reportProgress(this.job, text);
  }

}

async function startJob(job, q) {
  const callbackManager = new CallbackManager();
  callbackManager.addHandler(new WeblogCallbackHandler(job))
  let llm = new ChatOpenAI({ temperature: 0, concurrency: 3, callbackManager});
  const hcc = new HealthcareConceptChain({ llm, job, });
  reportProgress(job, "Beginning to code string: " + q);
  const res = await hcc.call({
    clinicalText: q,
  });
  reportProgress(job, "Done!\n-----\n");
  reportProgress(job, JSON.stringify(res, null, 2), true);
}

function reportProgress(job: string, line: string, done?: boolean) {
  app.locals.clients.forEach((client) => {
    if (client.job === job) {
      if (client.debug || done) { 

        client.write(line + "\n");
      }
      if (done) {
        client.end()
      }
    }
  });
}

app.locals.clients = new Set();

app.get("/", (req, res) => {
  // Set headers for streaming response
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  let job = randomUUID();
  res["job"] = job;
  res["debug"] = !!req.query.debug
  app.locals.clients.add(res);
  startJob(job, req.query.q);
  req.on("close", () => {
    app.locals.clients.delete(res);
  });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});