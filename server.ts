import { Application, Database, Router } from "./deps.ts";

interface Vocabulary {
  db: Database;
  searchQuery: string;
  system: string;
  transformResult(row: any): any;
}

function search(
  vocabulary: Vocabulary,
  query: string,
  limit = 100,
  offset = 0,
): any[] {
  const searchQuery = vocabulary.db.prepare(vocabulary.searchQuery);
  let qDisjunction = query.replace(/\-/g, " ").split(" ").filter((w) =>
    w.trim() != ""
  ).join(" OR ");
  console.log(qDisjunction);
  const results = searchQuery.all(qDisjunction, limit, offset);

  const rows: any[] = [];
  for (const row of results) {
    rows.push(vocabulary.transformResult(row));
  }

  return rows;
}

const makeVocab = (name, system) => {
  return {
    [name]: {
      db: new Database(`${name}.db`),
      searchQuery: `
        SELECT *, ROUND(rank, 0) FROM vocab
        WHERE vocab MATCH ?
        and rank < -5
        ORDER BY rank, length(display)
        LIMIT ? OFFSET ?
    `,
      system,
      transformResult(row) {
        return { code: row.code, display: row.display };
      },
    },
  };
};

const vocab: Record<string, Vocabulary> = {
  ...makeVocab("loinc", "http://loinc.org"),
  ...makeVocab("rxnorm", "http://www.nlm.nih.gov/research/umls/rxnorm"),
  ...makeVocab("snomed", "http://snomed.info/sct"),
};
console.log(vocab);

const LIMIT_DEFAULT = 20;
const app = new Application();
const router = new Router();
router.get("/search", (context) => {
  const terminology = context.request.url.searchParams.get("terminology")
    .toLowerCase();
  const query = context.request.url.searchParams.get("display");
  const limit = context.request.url.searchParams.get("limit") || LIMIT_DEFAULT;
  const offset = context.request.url.searchParams.get("offset") || 0;

  const vocabulary = vocab[terminology];

  if (vocabulary && query) {
    const results = search(
      vocabulary,
      query,
      parseInt(limit),
      parseInt(offset),
    );
    context.response.body = JSON.stringify(
      {
        system: vocabulary.system,
        results,
        links: {
          nextPageOfResults:
            `./search?terminology=${terminology}&display=${query}&offset=${
              offset + limit
            }&limit=${limit}`,
        },
      },
      null,
      2,
    );
  } else {
    console.log("invalid", terminology, query);
  }
});

app.use(router.routes());
app.use(router.allowedMethods());
await app.listen({ port: 8000 });
