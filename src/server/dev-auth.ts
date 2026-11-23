import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

/**
 * Login local para desenvolvimento e testes ponta a ponta, sem Supabase.
 * Só funciona com DEV_AUTH_SECRET definido E fora da produção da Vercel.
 * Em produção, o login é sempre o anônimo do Supabase.
 */
export function devAuthEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.DEV_AUTH_SECRET && env.DEV_AUTH_SECRET.length >= 16) && env.VERCEL_ENV !== "production";
}

function sign(id: string, secret: string) {
  return createHmac("sha256", secret).update(id).digest("base64url");
}

export function issueDevToken(secret: string, id: string = randomUUID()): { token: string; userId: string } {
  return { token: `dev.${id}.${sign(id, secret)}`, userId: id };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function verifyDevToken(token: string, secret: string): string | null {
  const [prefix, id, sig] = token.split(".");
  if (prefix !== "dev" || !id || !sig || !UUID.test(id)) return null;
  const expected = Buffer.from(sign(id, secret));
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given) ? id : null;
}
