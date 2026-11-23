import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getServerEnv } from "@/lib/env";

let admin: SupabaseClient | null = null;

/**
 * Cliente com a chave secreta: ignora RLS. Use SOMENTE no servidor (route handlers).
 * Nunca exponha este cliente nem a chave ao navegador.
 */
export function getAdminSupabase(): SupabaseClient | null {
  if (admin) return admin;
  const env = getServerEnv();
  if (!env.ok) return null;
  admin = createClient(env.value.supabaseUrl, env.value.supabaseSecretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return admin;
}
