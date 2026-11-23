"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getPublicEnv } from "@/lib/env";

let client: SupabaseClient | null = null;

/** Cliente do navegador (chave pública). Sujeito à RLS. */
export function getBrowserSupabase(): SupabaseClient {
  if (client) return client;
  const env = getPublicEnv();
  if (!env.ok) {
    throw new Error(`Supabase não configurado. Faltando: ${env.missing.join(", ")}. Veja o README.`);
  }
  client = createBrowserClient(env.value.supabaseUrl, env.value.supabasePublishableKey);
  return client;
}
