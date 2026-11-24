"use client";

import { ensureAnonymousSession } from "@/lib/supabase/session";
import { getBrowserSupabase } from "@/lib/supabase/browser";

const DEV_KEY = "scragbadum:dev-session:v1";
export const DEV_AUTH = process.env.NEXT_PUBLIC_DEV_AUTH === "1";

let pending: Promise<string> | null = null;

async function devToken(): Promise<string> {
  try {
    const saved = window.localStorage.getItem(DEV_KEY);
    if (saved) return saved;
  } catch {
    /* armazenamento bloqueado: segue sem salvar */
  }
  const res = await fetch("/api/dev/session", { method: "POST" });
  if (!res.ok) throw new Error("Não conseguimos te conectar agora. Tenta de novo.");
  const { token } = (await res.json()) as { token: string };
  try {
    window.localStorage.setItem(DEV_KEY, token);
  } catch {
    /* idem */
  }
  return token;
}

/**
 * Token de acesso do jogador. Sem cadastro: login anônimo do Supabase (ou local, em desenvolvimento).
 * A sessão fica salva no aparelho e é o que permite voltar à sala depois de cair.
 */
export function getAccessToken(): Promise<string> {
  if (!pending) {
    pending = (DEV_AUTH ? devToken() : ensureAnonymousSession(getBrowserSupabase().auth).then((s) => s.access_token)).finally(() => {
      // O Supabase renova o token sozinho; pedimos de novo a cada chamada para pegar o atual.
      pending = null;
    });
  }
  return pending;
}

export function forgetSession() {
  try {
    window.localStorage.removeItem(DEV_KEY);
  } catch {
    /* nada a fazer */
  }
}

/**
 * Token da sessão atual, SEM criar login anônimo (usado no painel: admin entra por e-mail).
 * null = ninguém logado neste navegador.
 */
export async function getExistingToken(): Promise<string | null> {
  if (DEV_AUTH) {
    try {
      return window.localStorage.getItem(DEV_KEY);
    } catch {
      return null;
    }
  }
  const { data } = await getBrowserSupabase().auth.getSession();
  return data.session?.access_token ?? null;
}

/** Login local de administrador de teste (só desenvolvimento). */
export async function devAdminLogin(): Promise<void> {
  const res = await fetch("/api/dev/session?admin=1", { method: "POST" });
  if (!res.ok) throw new Error("Login de teste indisponível.");
  const { token } = (await res.json()) as { token: string };
  window.localStorage.setItem(DEV_KEY, token);
}

/** Login de administrador por link mágico no e-mail. Só contas já cadastradas no Supabase. */
export async function sendAdminMagicLink(email: string): Promise<void> {
  const { error } = await getBrowserSupabase().auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${window.location.origin}/admin`, shouldCreateUser: false },
  });
  if (error) throw new Error("Não conseguimos enviar o link. Confere o e-mail ou fala com um administrador.");
}

export async function signOut(): Promise<void> {
  forgetSession();
  if (!DEV_AUTH) await getBrowserSupabase().auth.signOut();
}
