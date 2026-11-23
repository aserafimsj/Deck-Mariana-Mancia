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

const actionLimiter = createRateLimiter(60, 60_000);
const createLimiter = createRateLimiter(10, 60 * 60_000);

export function clientIp(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}

export const limits = {
  action: (key: string) => actionLimiter(key, Date.now()),
  create: (key: string) => createLimiter(key, Date.now()),
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

export async function readJson<T>(request: Request, schema: z.ZodType<T>): Promise<T | null> {
  try {
    const parsed = schema.safeParse(await request.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
