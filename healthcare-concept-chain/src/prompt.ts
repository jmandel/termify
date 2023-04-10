import { ai, human, system, templatize } from "templating.js";

const systemMessage = `You are a helpful informatics assistant trained in clinical terminology and deeply familiar with the most common medical synonyms.`;

const assistantWelcome = `Welcome! Please provide clinical text and I will find the core concepts that can be coded in FHIR. I focus on US Core vocabularies for every concept, and I create a terminology query for each concept. I break down complex concepts like "A and B" into separate concepts with distinct "focus". I infer intent; I never take shortcuts or offer unsolicited advice.

I query for the preferred term designation. If I'm unsure of the best term, I can include >1. But if there are different concept. I query for what terms that would  appear in a well-curated EHR, including details like dose, method, or laterality. I use clinical words, avoid acronyms or abbreviations, or symbols, and put spaces between terms.

I always identify the original text, the focus (a singular entity), my thoughts about coding, and the query that I will execute.

I always recognize 1) medications, 2) problems or conditions, 3) observable or measurable entities, 4) procedures.

key terminologies:
  * LOINC for observations, measurements, tests orders
  * SNOMED for problems, conditions, indications, procedures
  * RXNORM for medications and other rx or OTC products (query branded or generics according to user's words; do not query for sig details like indication)

Query params:
* system: URL identifying the code system to query
* display: query terms to match against coding displays 
`;

const userExample = `Patient walked 8000 steps yesterday. He has previously had a heart attack. Prilosec 20mg OTC for GERD symptoms. Recommend referral to neurology for headachs. track respitatory rate and bp daily.`;

const responseExample = `{
"originalText": "Patient walked 8000 steps yesterday.",
"focus": "steps",
"thoughts": "LOINC is more appropriate for observations and measurements",
"system": "http://loinc.org",
"display": ["step count for 24h", "total steps per day"]
}
{
"originalText": "He has previously had a heart attack.",
"focus": "heart attack",
"thoughts": "Considered using ICD-10 for heart attack, but SNOMED is more specific and widely used in FHIR resources.",
"system": "http://snomed.info/sct",
"display": ["myocardial infarction"]
}
{
"originalText": "Prilosec 20mg OTC for GERD symptoms",
"focus": "Prilosec 20mg OTC",
"thoughts": "Brand name drug with dose; search RxNorm semantic branded drugs",
"system": "http://www.nlm.nih.gov/research/umls/rxnorm",
"display": ["Prilosec 20 mg OTC"]
}
{
"originalText": "Prilosec 20mg OTC for GERD symptoms",
"focus": "GERD symptoms",
"thoughts": "Use SNOMED for GERD",
"system": "http://snomed.info/sct",
"display": ["gastroesophageal reflux disease"]
}
{
"originalText": "headachs",
"thoughts": "Use SNOMED for generic headache related terms.",
"system": "http://snomed.info/sct",
"display": ["headache"]
}
{
"originalText": "track respiratory rate and BP daily",
"focus": "respiratory rate",
"thoughts": "LOINC is the best system for vital signs",
"system": "http://loinc.org",
"display": ["respiratory rate"]
}
{
"originalText": "track respiratory rate and BP daily",
"focus": "BP",
"thoughts": "LOINC is the best system for vital signs",
"system": "http://loinc.org",
"display": ["systolic diastolic blood pressure panel"]
}`;

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
            f.display
          )}" (Problem: ${f.rationale})`
      )
      .join("\n") +
    "\n---"
  );
};

const nextStepsRefine = (_state) => `

1. Determine the array index of the best candidate and output this ("Array Index: ___,  Display _, Code _")

2. Produce and output the JSON code block ("Best Candidate:\n${"```"}json...") containing the code + display for (1), + system added. Here is an example to follow.

Best Candidate:
${"```"}json
{
  "system":  ...
  "display":  // exact copy
  "code":   // exact copy
}
${"```"}

3. I suspect this candidate may be too broad or too specific for my original text. I want well understood medical terms. Output you evaluation of the candidate ("Evaluation: ...")

4. Output "Final Grade: A or B or C" for the candidate you selected.
* A if this candidate would pass a formal review
* B if there is something missing, too precise, too vague, etc
* C if there seems to be a problem here and this work needs to be redone

5. Think carefully about why my results were not ideal. Determine what the ideal code would be for the original text, and verbalise your thoughts, starting with "Thought: ..." What new display name is ideal, using your knowledge of medical terms? Output a new query for me to try (format is "New Query: ?system=&display=" and must include system + display params). Never repeat a "failed query" from above, and never add detail beyond my original rquest.

(Example: "You were really asking about ____, which I can show you how to query for using,,,.\nNew Query: ?system=...)

6. Output a Final Action, which is "Final Action: New Query" or "Final Action: Return This Result".

`

const nextStepsRepair = (_state) => `
This query returned no results.

You need to think carefully about why. Consider 1) whether another system could work, 2) whether another display could work. Explain your thoughts, starting with "Thought: ..." Decide on a new query to try and output this query (format is "New Query: ?system=&display=" and must include system + display params).

(Example: "It looks like we may have queried the wrong system, or searched for the wrong display value\nNew Query: ?system=...)
`

export const refinementPrompt = templatize(async (state) => [
  system(systemMessage),
  ai(assistantWelcome),
  human(`Thanks! In my clinical note, I mentioned "${
    state.originalText
  }". Please help me determine if any of these codes is ideal for "${state.focus}".

${historyOfFailedQueries(state)}

Now I have queried the terminology server for ?system=${
    state.system
  }&display=${encodeURIComponent(state.display)}.

## Candidate Results

${JSON.stringify(state.resultJson, null, 2)}

## Next Steps

${state.resultJson?.results?.length > 0 ? nextStepsRefine(state) : nextStepsRepair(state)}

`),
]);
