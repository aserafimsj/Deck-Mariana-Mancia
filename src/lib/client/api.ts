"use client";

import type { ClientAction } from "@/lib/api-schemas";
import type { RoomSettings } from "@/lib/game-config";
import type { RoomResponse } from "@/server/game-service";
import { forgetSession, getAccessToken } from "./auth";

export type ApiError = { status: number; code: string; message: string };
export type ApiResult = { ok: true; data: RoomResponse } | { ok: false; error: ApiError };

const OFFLINE: ApiError = { status: 0, code: "OFFLINE", message: "Sem conexão. Tentando de novo..." };

async function call(method: "GET" | "POST", path: string, body?: unknown, retried = false): Promise<ApiResult> {
  let token: string;
  try {
    token = await getAccessToken();
  } catch (e) {
    return { ok: false, error: { status: 0, code: "AUTH", message: (e as Error).message } };
  }
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers: { authorization: `Bearer ${token}`, ...(body ? { "content-type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
  } catch {
    return { ok: false, error: OFFLINE };
  }
  if (res.status === 401 && !retried) {
    forgetSession();
    return call(method, path, body, true);
  }
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const err = json?.error ?? { code: "UNKNOWN", message: "Algo deu errado. Tenta de novo." };
    return { ok: false, error: { status: res.status, code: err.code, message: err.message } };
  }
  return { ok: true, data: json as RoomResponse };
}

/** Servidor ocupado (muitas ações simultâneas na sala): tenta de novo com a mesma ação, que é idempotente. */
async function withBusyRetry(run: () => Promise<ApiResult>): Promise<ApiResult> {
  let result = await run();
  for (let i = 0; i < 2 && !result.ok && result.error.code === "BUSY"; i++) {
    await new Promise((r) => setTimeout(r, 150 + Math.random() * 250));
    result = await run();
  }
  return result;
}

export const api = {
  createRoom: (nickname: string, settings: Partial<RoomSettings>) => call("POST", "/api/rooms", { nickname, settings }),
  join: (code: string, nickname: string, acceptedLevel4?: boolean) => call("POST", `/api/rooms/${code}/join`, { nickname, acceptedLevel4 }),
  view: (code: string) => call("GET", `/api/rooms/${code}`),
  act: (code: string, action: ClientAction) => {
    const clientActionId = crypto.randomUUID(); // o mesmo id em todas as tentativas: nunca duplica
    return withBusyRetry(() => call("POST", `/api/rooms/${code}/actions`, { clientActionId, action }));
  },
};
