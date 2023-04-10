import { ai, human, system, templatize } from "templating.js";

const systemMessage = `System: You are a helpful informatics assistant trained in clinical terminology and deeply familiar with the most common medical synonyms.`;

const assistantWelcome = `Welcome! Please provide clinical text and I will find the core concepts that can be coded in FHIR. I focus on US Core vocabularies for every concept, and I create a terminology query for each concept. I break down complex concepts like "A and B" into separate concepts with distinct "focus". I infer intent; I never take shortcuts or offer unsolicited advice.

I generate preferred term designations. If I'm unsure of the best term, I can include >1.  I query for what terms that would  appear in a well-curated EHR. 

I always use dose when you mention a dose; I never add a dose on my own.

Same for laterality and other details.

I always identify the original text, the focus (a singular entity), my thoughts about coding, and the query that I will execute.

I always recognize 1) medications, 2) problems or conditions, 3) observable or measurable entities, 4) procedures.


I use these three terminoogies:
  * LOINC for observations, measurements, tests orders
  * SNOMED for problems, conditions, indications, procedures
  * RXNORM for medications (I match dose if specified; otherwise I just use ingredients)
`;

const userExample = `Patient walked 8000 steps yesterday. He has previously had a heart attack. Prilosec for GERD symptoms. Track respiratory rate and BP daily.`;

const responseExample = `{
"originalText": "Patient walked 8000 steps yesterday.",
"focus": "steps",
"thoughts": "LOINC is most appropriate for observations and measurements",
"codes": [{
  "system": "http://loinc.org",
  "display": "Number of steps in unspecified time Pedometer"
  },
  {
  "system": "http://loinc.org",
  "display": "Number of steps in 24 hour Measured"
  },
  {
  "system": "http://loinc.org",
  "display": "Number of steps in 24 hour mean Measured"
  }]
}
{
"originalText": "He has previously had a heart attack.",
"focus": "heart attack",
"thoughts": "Considered using ICD-10 for heart attack, but SNOMED is more specific and widely used in FHIR resources.",
"codes": [{
  "system": "http://snomed.info/sct",
  "display": "Myocardial infarction (disorder)"
  }]
}
{
"originalText": "Prilosec for GERD symptoms [e.g., heart burn]",
"focus": "Prilosec",
"thoughts": "The user did not mention a dose, so I'll just find ingredients in RxNorm",
"codes": [{  
  "system": "http://www.nlm.nih.gov/research/umls/rxnorm",
  "display": "prilosec"
  }]
}
{
"originalText": "Prilosec for GERD symptoms",
"focus": "GERD symptoms",
"thoughts": "Use SNOMED for GERD",
"codes": [{
  "system": "http://snomed.info/sct",
  "display": "Gastroesophageal reflux disease (disorder)"
  }]
}
{
"originalText": "track respiratory rate and BP",
"focus": "respiratory rate",
"thoughts": "LOINC for respiratory rate",
"codes": [{
  "system": "http://loinc.org",
  "display": "Respiratory rate"
  }]
}
{
"originalText": "track respiratory rate and BP",
"focus": "BP",
"thoughts": "LOINC for blood pressure",
"codes": [{
  "system": "http://loinc.org",
  "display": "Blood pressure panel with all children optional"
  }]
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

const nextStepsRefine = (_state) => `

0. Describe your thoughts based on my exact original text and intent. ("0. Thoughts: ...")

1. Determine the best result above, considering previous and and additional candidates. Produce and output the JSON code block ("1. Best Candidate:\n${"```"}json...") containing the code + display for (1), + system added. Here is an example to follow.

Best Candidate:
${"```"}json
{
  "system":  "(system)",
  "display": "(exact copy of display)",
  "code": "(exact copy of code)"
}
${"```"}

2. Output "2. Final Grade: A or B or C" for the candidate you selected.
* A if this candidate would pass a formal review
* B if there is something missing, too precise, too vague, etc
* C if there seems to be a problem here and this work needs to be redone

3. Output a Final Recommendation, which is "4. Final Recommendation: Use this code" or "Final Recommendation: Keep looking".
`

export const refinementPrompt = templatize(async (state) => [
  system(systemMessage),
  ai(assistantWelcome),
  human(`Thanks! In my clinical note, I mentioned "${
    state.originalText
  }".
  
I have queried the terminology server for matches. Please help me determine if any of these codes is ideal for "${state.focus}". My thinking so far: ${state.thoughts}.

## Previous Candidate Results

${
  state.previousCandidates.length > 0  ? JSON.stringify(state.previousCandidates.map(c => c.coding), null, 2)
  : "None"
}

## Additional Candidate Results

These results are randomized, so do not pay attention to order.

${JSON.stringify(state.resultJson, null, 2)}

## Next Steps

${nextStepsRefine(state)}

`),
]);
