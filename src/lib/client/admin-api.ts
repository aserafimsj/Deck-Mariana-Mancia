"use client";

import { getExistingToken } from "./auth";

export type AdminResult<T> = { ok: true; data: T } | { ok: false; status: number; code: string; message: string; body?: unknown };

/** Chamada à API do painel com a sessão atual (nunca cria sessão nova). */
export async function adminFetch<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<AdminResult<T>> {
  const token = await getExistingToken();
  if (!token) return { ok: false, status: 401, code: "UNAUTHORIZED", message: "Entre com sua conta de equipe." };
  let res: Response;
  try {
    res = await fetch(path, {
      method: init.method ?? "GET",
      headers: { authorization: `Bearer ${token}`, ...(init.body !== undefined ? { "content-type": "application/json" } : {}) },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
    });
  } catch {
    return { ok: false, status: 0, code: "OFFLINE", message: "Sem conexão." };
  }
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      code: json?.error?.code ?? "ERROR",
      message: json?.error?.message ?? (json?.errors ? "Há linhas com erro." : "Algo deu errado."),
      body: json,
    };
  }
  return { ok: true, data: json as T };
}
