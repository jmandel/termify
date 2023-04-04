# Clinical Terminology Lookup for Large Language Models

This project aims to enhance large language models by helping them perform vocabulary lookups for clinical content. It consists of two main components:

1. Prompts guiding the language model to perform vocabulary searches.
2. A server that can respond to the searches with the relevant medical terminology codes.

The goal is to improve the understanding and generation of medical content by large language models through the use of standardized medical terminologies such as LOINC, RxNorm, and SNOMED.

## Current State and Aspirations

At present, the project includes a set of prompts to guide the language model in understanding and generating medical content. The prompts provide examples of handling user queries and performing HTTP queries to obtain the appropriate terminology codes for the given medical terms.

The long-term aspiration is to continually improve the accuracy and usefulness of the language model's responses by incorporating more comprehensive and up-to-date medical terminologies and refining the prompt structure.

## Getting Started

To get started with the project, follow these steps:

### Prerequisites

- Install [Deno](https://deno.land/#installation) on your system.
- Download the SQLite database files for the terminologies you wish to use (LOINC, RxNorm, and SNOMED).

### Running the server

1. Clone the repository.
2. Navigate to the project directory.
3. Run the server with the following command:

```bash
deno run --allow-all --allow-ffi --unstable server.ts
```


## Database Indexing Strategy

The project uses SQLite's FTS5 extension for indexing and searching medical terminologies. FTS5 (Full-Text Search version 5) is a powerful, flexible, and efficient full-text search engine that is integrated into the SQLite library.

### Why FTS5?

FTS5 provides several benefits that make it suitable for this project:

1. **Performance:** FTS5 is designed to enable efficient full-text searches on large datasets, even those with millions of records. It achieves this by creating an inverted index that maps individual terms to the documents containing them, which speeds up search operations.

2. **Flexibility:** FTS5 supports various query types, such as phrase queries, prefix queries, and proximity queries. It also allows users to customize the tokenizer, which is responsible for extracting terms from documents. This flexibility enables the project to tailor the search engine to the specific requirements of medical terminologies.

3. **Simple Integration:** FTS5 is integrated into SQLite, which means there are no additional dependencies or external libraries required. This simplifies deployment and reduces the overall complexity of the project.

4. **Portability:** SQLite is a serverless, self-contained database engine that is widely supported across various platforms. This ensures that the project can be easily deployed and used on different systems without significant modifications.

To leverage FTS5's capabilities, each medical terminology (LOINC, RxNorm, and SNOMED) has its own SQLite database file with a dedicated FTS5 virtual table. These tables store the medical terms and their corresponding codes, which can be efficiently searched using FTS5's query language.


## Integration with the Language Model

The server fits in with the prompts by providing a simple and efficient way for the language model to perform vocabulary lookups when generating responses. As the language model processes user queries, it can use the server's `$lookup-code` endpoint to obtain the appropriate medical terminology codes, thus improving the accuracy and utility of its responses.

Example tool

```sh
cd langchain-tool
export OPENAI_API_KEY=
npm run fhir "patient has a left inguinal hernia. he needs to stop his coumadin before surgery"
```

```json
{
  "result": [
    {
      "originalText": "left inguinal hernia",
      "focus": "inguinal hernia",
      "thoughts": "SNOMED is the best system for anatomical locations and conditions",
      "system": "http://snomed.info/sct",
      "query": [
        "inguinal hernia"
      ],
      "bestCoding": {
        "system": "http://snomed.info/sct",
        "code": "236022004",
        "display": "Left inguinal hernia (disorder)"
      }
    },
    {
      "originalText": "stop his coumadin before surgery",
      "focus": "coumadin",
      "thoughts": "RxNorm is the best system for medications, and I can find a term at the level of medication + dosage",
      "system": "http://www.nlm.nih.gov/research/umls/rxnorm",
      "query": [
        "warfarin"
      ],
      "bestCoding": {
        "system": "http://www.nlm.nih.gov/research/umls/rxnorm",
        "code": "11289",
        "display": "warfarin"
      }
    }
  ]
}
```


