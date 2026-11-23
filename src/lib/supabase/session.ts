import type { Session, SupabaseClient } from "@supabase/supabase-js";

type AuthClient = Pick<SupabaseClient["auth"], "getSession" | "signInAnonymously">;

/**
 * Garante que o jogador tem uma sessão. Sem cadastro: usa login anônimo do Supabase.
 * A sessão fica salva no aparelho, o que permite voltar à sala depois de cair da rede.
 * Chame só quando a pessoa for criar ou entrar numa sala (não ao abrir o site).
 */
export async function ensureAnonymousSession(auth: AuthClient): Promise<Session> {
  const current = await auth.getSession();
  if (current.data.session) return current.data.session;

  const { data, error } = await auth.signInAnonymously();
  if (error || !data.session) {
    throw new Error("Não conseguimos te conectar agora. Confere a internet e tenta de novo.", { cause: error ?? undefined });
  }
  return data.session;
}
