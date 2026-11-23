import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";

const ROOT = path.resolve(import.meta.dirname, "../..");

/** URL de um Postgres com superusuário. Local: `pnpm db:local`. CI: serviço do GitHub Actions. */
export const ADMIN_URL = process.env.DATABASE_URL;

function sqlFiles(): string[] {
  const migrations = readdirSync(path.join(ROOT, "supabase/migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => path.join(ROOT, "supabase/migrations", f));
  return [path.join(ROOT, "tests/db/supabase-stub.sql"), ...migrations, path.join(ROOT, "supabase/seed.sql")];
}

export type TestDb = { pool: pg.Pool; name: string; drop: () => Promise<void> };

/** Cria um banco novo, aplica stub + migrations + seed, e devolve um pool para ele. */
export async function createTestDb(): Promise<TestDb> {
  if (!ADMIN_URL) throw new Error("DATABASE_URL não definida");
  const name = `scrag_test_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
  const admin = new pg.Client({ connectionString: ADMIN_URL });
  await admin.connect();
  await admin.query(`create database ${name}`);
  await admin.end();

  const url = new URL(ADMIN_URL);
  url.pathname = `/${name}`;
  const pool = new pg.Pool({ connectionString: url.toString(), max: 4 });

  for (const file of sqlFiles()) {
    try {
      await pool.query(readFileSync(file, "utf8"));
    } catch (error) {
      throw new Error(`Falha ao aplicar ${path.relative(ROOT, file)}: ${(error as Error).message}`);
    }
  }

  return {
    pool,
    name,
    drop: async () => {
      await pool.end();
      const c = new pg.Client({ connectionString: ADMIN_URL });
      await c.connect();
      await c.query(`drop database if exists ${name} with (force)`);
      await c.end();
    },
  };
}

type Role = "anon" | "authenticated" | "service_role";

/**
 * Executa `fn` como um papel do Supabase, simulando o JWT do usuário.
 * Tudo roda numa transação que é desfeita no final: os testes não interferem entre si.
 */
export async function as<T>(pool: pg.Pool, role: Role, userId: string | null, fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(`set local role ${role}`);
    await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(userId ? { sub: userId, role } : { role })]);
    return await fn(client);
  } finally {
    await client.query("rollback").catch(() => undefined);
    client.release();
  }
}

/** Cria um usuário no auth (o gatilho cria o perfil) e devolve o id. */
export async function createUser(pool: pg.Pool, opts: { anonymous?: boolean; role?: "admin" | "editor" } = {}): Promise<string> {
  const { rows } = await pool.query<{ id: string }>("insert into auth.users (is_anonymous) values ($1) returning id", [opts.anonymous ?? true]);
  const id = rows[0]!.id;
  if (opts.role) await pool.query("insert into public.user_roles (user_id, role) values ($1, $2)", [id, opts.role]);
  return id;
}

let codeCounter = 0;
const ALPHA = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** Código de sala único e válido para os testes. */
export function nextCode(): string {
  let n = codeCounter++;
  let s = "";
  for (let i = 0; i < 5; i++) {
    s = ALPHA[n % ALPHA.length] + s;
    n = Math.floor(n / ALPHA.length);
  }
  return s;
}

export async function createRoom(pool: pg.Pool, hostId: string, extra: { humorLevel?: number; visibility?: string } = {}): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    "insert into public.rooms (code, host_id, humor_level, visibility) values ($1, $2, $3, $4) returning id",
    [nextCode(), hostId, extra.humorLevel ?? 2, extra.visibility ?? "private"],
  );
  return rows[0]!.id;
}

export async function addPlayer(pool: pg.Pool, roomId: string, userId: string, nickname: string, seat: number, status = "active") {
  await pool.query("insert into public.room_players (room_id, user_id, nickname, seat, status) values ($1, $2, $3, $4, $5)", [
    roomId,
    userId,
    nickname,
    seat,
    status,
  ]);
}

/** Espera que a promessa falhe com um erro do Postgres cujo código ou mensagem combine. */
export async function expectPgError(p: Promise<unknown>, match: RegExp): Promise<void> {
  try {
    await p;
  } catch (error) {
    const e = error as { code?: string; message?: string };
    const text = `${e.code ?? ""} ${e.message ?? ""}`;
    if (!match.test(text)) throw new Error(`Erro inesperado: ${text}`);
    return;
  }
  throw new Error(`Esperava erro ${match}, mas a operação funcionou`);
}
