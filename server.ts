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
  const results = searchQuery.all(qDisjunction, limit, offset);
  console.log(searchQuery);

  const rows: any[] = [];
  for (const row of results) {
      console.log(row)
    rows.push(vocabulary.transformResult(row));
  }
  console.log(rows)

  return rows;
}

const makeVocab = (name, system) => {
  return {
    [name]: {
      db: new Database(`${name}.db`),
      searchQuery: `
        SELECT *, ROUND(rank, 0) rank, length(display) FROM vocab
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
router.get("/\$lookup-code", (context) => {
  const terminology = context.request.url.searchParams.get("system")
    .toLowerCase();
  const query = (context.request.url.searchParams.get("display") || 
                context.request.url.searchParams.get("query")
                ).replace(/[^A-Za-z\s]+/g, " ");
  console.log(query)
  const limit = parseInt(context.request.url.searchParams.get("limit") || LIMIT_DEFAULT);
  const offset = parseInt(context.request.url.searchParams.get("offset") || 0);

  const vocabulary = vocab[terminology] || Object.values(vocab).find(v => v.system === terminology);

  if (vocabulary && query) {
    const results = search(
      vocabulary,
      query,
      limit,
      offset,
    );
    context.response.body = JSON.stringify(
      {
        system: vocabulary.system,
        results,
        links: {
          nextPageOfResults:
            `./$lookup-code?system=${terminology}&display=${encodeURIComponent(query)}&offset=${
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
