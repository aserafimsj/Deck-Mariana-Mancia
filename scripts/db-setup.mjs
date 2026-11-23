// Cria (ou recria) um banco local com o "stub" do Supabase, as migrations e as cartas iniciais.
// Uso: DATABASE_URL=postgres://postgres@localhost:54329/postgres node scripts/db-setup.mjs [nome_do_banco]
// Imprime a URL do banco criado (use como SUPABASE_DB_URL).
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";

const admin = process.env.DATABASE_URL;
if (!admin) {
  console.error("Defina DATABASE_URL (rode `pnpm db:local` para ter um Postgres local).");
  process.exit(1);
}
const name = process.argv[2] ?? "scragbadum_dev";
if (!/^[a-z0-9_]+$/.test(name)) throw new Error("nome de banco inválido");
const root = path.resolve(import.meta.dirname, "..");

const c = new pg.Client({ connectionString: admin });
await c.connect();
await c.query(`drop database if exists ${name} with (force)`);
await c.query(`create database ${name}`);
await c.end();

const url = new URL(admin);
url.pathname = `/${name}`;
const db = new pg.Client({ connectionString: url.toString() });
await db.connect();
const migrations = readdirSync(path.join(root, "supabase/migrations")).filter((f) => f.endsWith(".sql")).sort();
for (const file of ["tests/db/supabase-stub.sql", ...migrations.map((m) => `supabase/migrations/${m}`), "supabase/seed.sql"]) {
  await db.query(readFileSync(path.join(root, file), "utf8"));
}
await db.end();
console.log(url.toString());
