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
      "focus": "inguinal hernia",
      "thoughts": "Use SNOMED for hernia",
      "system": "http://snomed.info/sct",
      "display": [
        "inguinal hernia"
      ],
      "bestCoding": {
        "system": "http://snomed.info/sct",
        "code": "396232000",
        "display": "Inguinal hernia (disorder)"
      },
      "score": {
        "grade": "A",
        "rationale": "This code accurately represents the concept of \"inguinal hernia\" without specifying laterality or other details."
      }
    },
    {
      "originalText": "stop his coumadin before surgery",
      "focus": "coumadin",
      "thoughts": "Use RxNorm for Coumadin",
      "system": "http://www.nlm.nih.gov/research/umls/rxnorm",
      "display": [
        "warfarin"
      ],
      "bestCoding": {
        "system": "http://www.nlm.nih.gov/research/umls/rxnorm",
        "code": "11289",
        "display": "warfarin"
      },
      "score": {
        "grade": "A",
        "rationale": "\"Coumadin\" is a brand name for the medication warfarin, and \"warfarin\" is the generic name. The candidate result with code \"11289\" and display \"warfarin\" is the best match for the term \"coumadin\"."
      }
    },
    {
      "originalText": "stop his coumadin before surgery",
      "focus": "surgery",
      "thoughts": "Use SNOMED for surgery",
      "system": "http://snomed.info/sct",
      "display": [
        "surgery"
      ],
      "bestCoding": {
        "system": "http://snomed.info/sct",
        "code": "387713003",
        "display": "Surgical procedure (procedure)"
      },
      "score": {
        "grade": "A",
        "rationale": "\"Surgical procedure\" is a broad term that encompasses a wide range of surgical interventions, including those that may require the cessation of anticoagulant therapy like coumadin. It is the most appropriate term to use in this context."
      }
    }
  ]
}
```
