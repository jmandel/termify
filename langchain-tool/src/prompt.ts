import {
  AIMessagePromptTemplate, ChatPromptTemplate,
  HumanMessagePromptTemplate, SystemMessagePromptTemplate
} from "langchain/prompts";
import { ai, human, system, templatize } from "templating.js";

const systemMessage = `You are a helpful informatics assistant trained in clinical terminology and deeply familiar with the most common medical synonyms.`;

const assistantWelcome = `Welcome! Please provide clinical text and I will find the core concepts that can be coded in FHIR. I focus on US Core vocabularies for every concept, and I create a terminology query for each concept. I break down complex concepts like "A and B" into separate concepts with distinct "focus".

query strings: I query for the preferred term designation. If I'm unsure of the best query, I can include >1. But if there are different concept. Query is what should appear well curated EHR. I use short words, avoid acronyms or abbreviations, or symbols, and put spaces between terms. I separate them out into top-level JSON concepts {}. This is what should appear well curated EHR.

I always identify the original text, the focus (a singular entity), my thoughts about coding, and the query that I will execute.

I always recognize 1) medications,2) problems or conditions, 3) observable or measurable entities.

key terminologies:
  * LOINC for observations, measurements, tests orders
  * SNOMED for problems, conditions, indications, procedures
  * RXNORM for medications and other rx or OTC products (query for ingredient or dose only; do not query for indication or sig terms)`;

const userExample = `Patient walked 8000 steps yesterday. He has previously had a heart attack. He takes lisinopril 10 mg daily for high blood pressure. Recommend referral to neurology for headachs. track respitatory rate and bp daily.`;

const responseExample = `{
"originalText": "Patient walked 8000 steps yesterday.",
"focus": "steps",
"thoughts": "LOINC is more appropriate for observations and measurements",
"system": "http://loinc.org",
"query": ["step count for 24h", "total steps per day"]
}
{
"originalText": "He has previously had a heart attack.",
"focus": "heart attack",
"thoughts": "Considered using ICD-10 for heart attack, but SNOMED is more specific and widely used in FHIR resources.",
"system": "http://snomed.info/sct",
"query": ["myocardial infarction"]
}
{
"originalText": "He takes lisinopril 10 mg.",
"thoughts": "RxNorm is the best system, and I can find a term at the level of medication + dosage",
"system": "http://www.nlm.nih.gov/research/umls/rxnorm",
"query": ["lisinopril 10 MG"]
}
{
"originalTest": "He takes lisinopril 10 mg daily for high blood pressure",
"focus": "high blood pressure",
"thoughts": "Considered using ICD-10 for hypertension, but SNOMED is more specific and widely used in FHIR resources.",
"system": "http://snomed.info/sct",
"query": ["essential hypertension", "primary hypertension"]
}
{
"originalText": "headachs",
"thoughts": "Use SNOMED for generic headache related terms.",
"system": "http://snomed.info/sct",
"query": ["headache"]
}
{
"originalText": "track respiratory rate and BP daily",
"focus": "respiratory rate",
"thoughts": "LOINC is the best system for vital signs",
"system": "http://loinc.org",
"query": ["respiratory rate"]
}
{
"originalText": "track respiratory rate and BP daily",
"focus": "BP",
"thoughts": "LOINC is the best system for vital signs",
"system": "http://loinc.org",
"query": ["systolic diastolic blood pressure panel"]
}`;

/*

Query for extraction
map each Concept.query to "Determine best code"
  -> if query[] > 1, map each query[] to "Determine best code", and combiner == "Given these n, what is the best"?
*/
export const prompt = ChatPromptTemplate.fromPromptMessages([
  SystemMessagePromptTemplate.fromTemplate(systemMessage),
  AIMessagePromptTemplate.fromTemplate(assistantWelcome),
  HumanMessagePromptTemplate.fromTemplate(userExample),
  AIMessagePromptTemplate.fromTemplate(responseExample),
  HumanMessagePromptTemplate.fromTemplate(`{clinicalText}`),
]);

interface HealthCodingInitialState {
  clinicalText: string;
}

export const initialPrompt = templatize(
  async (state: HealthCodingInitialState) => [
    system(systemMessage),
    ai(assistantWelcome),
    human(userExample),
    ai(responseExample),
    human(state.clinicalText),
  ]
);

const historyOfFailedQueries = (state) => {
  if (!state?.failures?.length) {
    return "";
  }
  return (
    `This concept has been difficult to look up. We have tried some queries already without sucess, so please keep this in mind and do not repeat mistakes:\n` +
    state.failures
      .map(
        (f) =>
          `* Failed query: "?system=${f.system}&display=${encodeURIComponent(
            f.query
          )}" (Problem: ${f.rationale})`
      )
      .join("\n") +
    "\n---"
  );
};

export const refinementPrompt = templatize(async (state) => [
  system(systemMessage),
  ai(assistantWelcome),
  human(`Thanks! In my clinical note, I mentioned "${
    state.originalText
  }". I'm looking for the code that best matches.

${historyOfFailedQueries(state)}

Now I have queried the terminology server for ?system=${
    state.system
  }&display=${encodeURIComponent(state.query)}.

Here are the candidate results:

${state.resultJson}

Examine the array of candidate results. Narrow it down to the best choice. Copy its code + display exactly into a ${"```"}json code block like:

${"```"}json
{
  "system": "", // exact copy from candidate system
  "display": "", // exact copy from candidate result JSON
  "code": "" // exact copy from candidate result JSON
}
${"```"}

Then output a "Final Grade: A or B or C or F", evaluating the Coding. Include a brief justification ("Justification: ...")
* A if it clearly meets the user's intent
* B if there is something that you are uncertain of
* C if there seems to be a problem here and this work needs to be redone

If the server provided no suitable results, you need to think carefully about why. Consider 1) whether another system could work, 2) whether another display could work. Explain your thoughts, starting with "Thought: ..." Decide on a new query to try and output this query (format is "New Query: ?system=&display=" and must include system + display params).

(Example: "It looks like we may have queried the wrong system, or searched for the wrong display value\nNew Query: ?system=...)

`),
]);
