import { Database } from "https://deno.land/x/sqlite3@0.9.1/mod.ts";
import { parse } from "https://deno.land/std/encoding/csv.ts";

type Loinc = {
  code: string;
  display: string;
  related: string;
  common_test_rank: string;
  units: string;
};

async function readCSVFile(filePath: string): Promise<string[][]> {
  const file = await Deno.readTextFile(filePath);
  return parse(file);
}

function createLoincObjects(csvData: string[][], header: string[]): Loinc[] {
  const indexes = header.reduce<Record<string, number>>(
    (accumulator, currentValue, currentIndex) => {
      accumulator[currentValue] = currentIndex;
      return accumulator;
    },
    {}
  );

  return csvData.slice(1).map((row) => {
    const loinc: Record<string, any> = {};
    for (const [key, index] of Object.entries(indexes)) {
      loinc[key] = row[index];
    }
    loinc["COMMON_TEST_RANK"] = parseInt(loinc["COMMON_TEST_RANK"]);
    if (loinc["COMMON_TEST_RANK"] === 0) {
      loinc["COMMON_TEST_RANK"] = 1000000;
    }
    return {
      code: loinc["LOINC_NUM"],
      display: loinc["LONG_COMMON_NAME"],
      related: loinc["RELATEDNAMES2"],
      common_test_rank: loinc["COMMON_TEST_RANK"],
      units: loinc["EXAMPLE_UCUM_UNITS"],
    };
  });
}

function setupDatabase(database: Database): void {
  database.exec("DROP TABLE IF EXISTS vocab");
  database.exec(
    "CREATE VIRTUAL TABLE IF NOT EXISTS vocab USING fts5(code, display, related, common_test_rank, units, tokenize = porter)"
  );
  database.exec("INSERT into vocab(vocab, rank) values('rank', 'bm25(100.0, 10, 1, 0)')");
}

function insertLoincs(database: Database, loincs: Loinc[]): void {
  const preparedInsert = database.prepare("INSERT INTO vocab (code, display, related, common_test_rank, units) VALUES (?, ?, ?, ?, ?)");

  for (const loinc of loincs) {
    preparedInsert.value(loinc.code, loinc.display, loinc.related, loinc.common_test_rank, loinc.units);
  }
}

async function main(): Promise<void> {
  const csvData = await readCSVFile("LoincTable/Loinc.csv");
  const header = csvData[0];
  const loincs = createLoincObjects(csvData, header);

  const database = new Database("loinc.db");
  database.exec("BEGIN");
  setupDatabase(database);
  insertLoincs(database, loincs);
  database.exec("COMMIT");
  database.close();
}

main();
