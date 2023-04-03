import { Database } from "https://deno.land/x/sqlite3@0.9.1/mod.ts";
export { Database } from "https://deno.land/x/sqlite3@0.9.1/mod.ts";
export { Application, Router } from "https://deno.land/x/oak@v12.1.0/mod.ts";

let d = new Database("./throwaway.db");
