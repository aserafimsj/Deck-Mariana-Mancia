import { devAuthEnabled, issueDevToken } from "@/server/dev-auth";
import { getDeps, json } from "@/server/http";

/** Login local (só desenvolvimento e testes). Em produção responde 404. */
export async function POST() {
  if (!devAuthEnabled()) return new Response("Not found", { status: 404 });
  const deps = getDeps();
  const { token, userId } = issueDevToken(process.env.DEV_AUTH_SECRET!);
  if (deps) await deps.store.ensureAuthUser(userId);
  return json({ token, userId });
}
