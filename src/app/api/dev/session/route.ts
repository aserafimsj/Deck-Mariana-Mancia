import { devAuthEnabled, issueDevToken } from "@/server/dev-auth";
import { getDeps, json } from "@/server/http";
import { getPool } from "@/server/store";

/**
 * Login local (só desenvolvimento e testes). Em produção responde 404.
 * `?admin=1` cria um administrador de teste (para o painel), com e-mail fictício.
 */
export async function POST(request: Request) {
  if (!devAuthEnabled()) return new Response("Not found", { status: 404 });
  const deps = getDeps();
  const { token, userId } = issueDevToken(process.env.DEV_AUTH_SECRET!);
  if (deps) await deps.store.ensureAuthUser(userId);
  if (new URL(request.url).searchParams.get("admin") === "1" && process.env.SUPABASE_DB_URL) {
    const pool = getPool(process.env.SUPABASE_DB_URL);
    await pool.query("update auth.users set email = $2, is_anonymous = false where id = $1", [userId, `admin-${userId.slice(0, 8)}@teste.local`]);
    await pool.query("insert into public.user_roles (user_id, role) values ($1, 'admin') on conflict do nothing", [userId]);
  }
  return json({ token, userId });
}
