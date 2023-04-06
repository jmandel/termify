# Termify: Clinical Coding for LLMs

This project aims to enhance large language models by helping them perform vocabulary lookups for clinical content. It consists of two main components:

1. Langchain `HealthcareConceptChain` that can codify text
2. A terminology server that supports the chain

The goal is to improve the understanding and generation of medical content by large language models through the use of standardized medical terminologies such as LOINC, RxNorm, and SNOMED.

## Example Invocation


```sh
$ npm run termify "patient has a left inguinal hernia. he needs to stop his coumadin before surgery"
```

```json
{
  "result": [
    {
      "originalText": "left inguinal hernia",
      "focus": "left inguinal hernia",
      "thoughts": "Use SNOMED for hernia",
      "coding": {
        "system": "http://snomed.info/sct",
        "code": "236022004",
        "display": "Left inguinal hernia (disorder)"
      },
      "selfAssessment": {
        "grade": "A",
        "rationale": "The candidate result \"Left inguinal hernia\" is a perfect match for the user's query \"left inguinal hernia\". The code \"236022004\" is specific to the left side and accurately describes the condition."
      }
    },
    {
      "originalText": "stop his coumadin before surgery",
      "focus": "coumadin",
      "thoughts": "Use RxNorm for Coumadin",
      "coding": {
        "system": "http://www.nlm.nih.gov/research/umls/rxnorm",
        "code": "11289",
        "display": "warfarin"
      },
      "selfAssessment": {
        "grade": "A",
        "rationale": "\"Warfarin\" is the generic name for Coumadin, and is the most commonly used term in clinical settings."
      }
    },
    {
      "originalText": "stop his coumadin before surgery",
      "focus": "surgery",
      "thoughts": "Use SNOMED for surgery",
      "coding": {
        "system": "http://snomed.info/sct",
        "code": "387713003",
        "display": "Surgical procedure (procedure)"
      },
      "selfAssessment": {
        "grade": "A",
        "rationale": "\"Surgical procedure\" is a broad term that encompasses a wide range of surgical interventions, including those that may require the patient to stop taking anticoagulants like coumadin. This code accurately captures the concept of surgery and is the most appropriate choice from the list of candidates."
      }
    }
  ]
}
```

