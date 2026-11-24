import "server-only";

import { randomBytes } from "node:crypto";
import { z } from "zod";
import { getServerEnv } from "@/lib/env";
import { getRequestUserId, supabaseTokenVerifier, type TokenVerifier } from "./auth";
import { devAuthEnabled, verifyDevToken } from "./dev-auth";
import type { Deps, ServiceResult } from "./game-service";
import { createRateLimiter } from "./rate-limit";
import { noopNotifier, supabaseNotifier } from "./realtime";
import { createPgStore, getPool } from "./store";
import { getAdminSupabase } from "./supabase-admin";

/** Peças compartilhadas pelas rotas /api/rooms/*. */

export function getDeps(): Deps | null {
  const dbUrl = process.env.SUPABASE_DB_URL;
  if (!dbUrl) return null;
  const env = getServerEnv();
  return {
    store: createPgStore(getPool(dbUrl)),
    notify: env.ok ? supabaseNotifier(env.value.supabaseUrl, env.value.supabaseSecretKey) : noopNotifier,
    now: () => Date.now(),
    randomBytes: (n) => new Uint8Array(randomBytes(n)),
  };
}

const verifier: TokenVerifier = async (token) => {
  if (token.startsWith("dev.")) {
    return devAuthEnabled() ? verifyDevToken(token, process.env.DEV_AUTH_SECRET!) : null;
  }
  const admin = getAdminSupabase();
  return admin ? supabaseTokenVerifier(admin.auth)(token) : null;
};

export function authenticate(request: Request) {
  return getRequestUserId(request, verifier);
}

// Limites em memória (por instância): baratos, para ações frequentes.
const actionLimiter = createRateLimiter(120, 60_000);
const fallbacks = new Map<string, ReturnType<typeof createRateLimiter>>();
function memoryFallback(key: string, limit: number, windowSeconds: number) {
  const id = `${limit}/${windowSeconds}`;
  if (!fallbacks.has(id)) fallbacks.set(id, createRateLimiter(limit, windowSeconds * 1000));
  return fallbacks.get(id)!(key, Date.now());
}

/**
 * Limite compartilhado entre instâncias (no Postgres), para ações que atraem abuso.
 * Se o banco falhar, cai para o limite em memória em vez de bloquear o jogo.
 */
async function sharedLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) return memoryFallback(key, limit, windowSeconds);
  try {
    const { rows } = await getPool(url).query<{ ok: boolean }>("select public.hit_rate_limit($1, $2, $3) as ok", [key.slice(0, 200), limit, windowSeconds]);
    return rows[0]?.ok ?? true;
  } catch (e) {
    console.error("limite compartilhado indisponível", e);
    return memoryFallback(key, limit, windowSeconds);
  }
}

/**
 * IP de quem fez a requisição. Na Vercel, x-real-ip e x-forwarded-for são preenchidos pela própria
 * plataforma (o valor enviado pelo cliente é sobrescrito), então não dá para falsificar.
 * Localmente, os cabeçalhos são livres (útil no teste de carga para simular vários IPs).
 */
export function clientIp(request: Request) {
  return request.headers.get("x-real-ip")?.trim() || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}

// Por IP o limite é bem mais alto: muita gente compartilha IP (Wi-Fi do bar, operadora móvel).
const ipLimiter = createRateLimiter(1200, 60_000);

export const limits = {
  /** Ações e sinal de vida: 120 por minuto por usuário (por instância). */
  action: (key: string) => actionLimiter(key, Date.now()),
  /** Sinal de vida por IP: 1.200 por minuto (só pega abuso pesado; IPs são compartilhados). */
  viewByIp: (ip: string) => ipLimiter(`view:${ip}`, Date.now()),
  /** Criar sala: 10 por hora por usuário e 30 por hora por IP (todas as instâncias). */
  create: async (userId: string, ip: string) => (await sharedLimit(`create:u:${userId}`, 10, 3600)) && (await sharedLimit(`create:ip:${ip}`, 30, 3600)),
  /** Entrar em sala: 60 por minuto por IP (todas as instâncias); dificulta testar códigos em massa. */
  join: (ip: string) => sharedLimit(`join:ip:${ip}`, 60, 60),
};

export function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "cache-control": "no-store" } });
}

export function errorResponse(status: number, code: string, message: string) {
  return json({ error: { code, message } }, status);
}

export const errors = {
  notConfigured: () => errorResponse(503, "NOT_CONFIGURED", "O servidor do jogo ainda não foi configurado."),
  unauthorized: () => errorResponse(401, "UNAUTHORIZED", "Sua sessão expirou. Recarrega a página."),
  rateLimited: () => errorResponse(429, "RATE_LIMITED", "Calma! Muitas ações seguidas. Espera uns segundos."),
  badRequest: (message = "Requisição inválida.") => errorResponse(400, "BAD_REQUEST", message),
};

export function fromService(result: ServiceResult) {
  return result.ok ? json(result.data) : errorResponse(result.error.status, result.error.code, result.error.message);
}

/**
 * Lê e valida o corpo JSON, recusando corpos maiores que `maxBytes` (padrão 16 KB:
 * nenhuma ação de jogo chega perto disso). Evita gastar memória com requisições abusivas.
 */
export async function readJson<T>(request: Request, schema: z.ZodType<T>, maxBytes = 16 * 1024): Promise<T | null> {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > maxBytes) return null;
  try {
    const text = await request.text();
    if (Buffer.byteLength(text) > maxBytes) return null;
    const parsed = schema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
