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
gunzip *.db.gz
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