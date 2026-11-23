/** Valida um token de acesso e devolve o ID do usuário (ou null). */
export type TokenVerifier = (token: string) => Promise<string | null>;

const BEARER = /^Bearer\s+(\S+)$/i;

export function extractBearerToken(header: string | null | undefined): string | null {
  if (!header) return null;
  return BEARER.exec(header.trim())?.[1] ?? null;
}

/**
 * Identifica quem fez a requisição a partir do cabeçalho Authorization.
 * Toda ação de jogo passa por aqui; sem usuário válido, a ação é recusada.
 */
export async function getRequestUserId(request: Request, verify: TokenVerifier): Promise<string | null> {
  const token = extractBearerToken(request.headers.get("authorization"));
  if (!token) return null;
  try {
    return await verify(token);
  } catch {
    return null;
  }
}

/** Verificador real: pergunta ao Supabase Auth se o token é válido. */
export function supabaseTokenVerifier(auth: {
  getUser(token: string): Promise<{ data: { user: { id: string } | null }; error: unknown }>;
}): TokenVerifier {
  return async (token) => {
    const { data, error } = await auth.getUser(token);
    return error || !data.user ? null : data.user.id;
  };
}
