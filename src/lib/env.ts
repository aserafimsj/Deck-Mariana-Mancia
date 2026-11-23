import { z } from "zod";

/**
 * Variáveis de ambiente. As NEXT_PUBLIC_* vão para o navegador; as demais ficam só no servidor.
 * A chave "publishable" (sb_publishable_...) e a antiga "anon" funcionam igual.
 * A chave "secret" (sb_secret_...) e a antiga "service_role" também.
 */
const publicSchema = z.object({
  supabaseUrl: z.url({ protocol: /^https?$/ }),
  supabasePublishableKey: z.string().min(20),
});

const serverSchema = publicSchema.extend({
  supabaseSecretKey: z.string().min(20),
});

export type PublicEnv = z.infer<typeof publicSchema>;
export type ServerEnv = z.infer<typeof serverSchema>;

export type EnvResult<T> = { ok: true; value: T } | { ok: false; missing: string[] };

const NAMES: Record<string, string> = {
  supabaseUrl: "NEXT_PUBLIC_SUPABASE_URL",
  supabasePublishableKey: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  supabaseSecretKey: "SUPABASE_SECRET_KEY",
};

function parse<T>(schema: z.ZodType<T>, raw: Record<string, string | undefined>): EnvResult<T> {
  const result = schema.safeParse(raw);
  if (result.success) return { ok: true, value: result.data };
  const missing = [...new Set(result.error.issues.map((i) => NAMES[String(i.path[0])] ?? String(i.path[0])))];
  return { ok: false, missing };
}

export function parsePublicEnv(raw: Record<string, string | undefined>): EnvResult<PublicEnv> {
  return parse(publicSchema, raw);
}

export function parseServerEnv(raw: Record<string, string | undefined>): EnvResult<ServerEnv> {
  return parse(serverSchema, raw);
}

// As variáveis NEXT_PUBLIC_* precisam ser lidas por nome literal para o Next.js embuti-las no navegador.
export function getPublicEnv(): EnvResult<PublicEnv> {
  return parsePublicEnv({
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    supabasePublishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
}

export function getServerEnv(): EnvResult<ServerEnv> {
  return parseServerEnv({
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    supabasePublishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    supabaseSecretKey: process.env.SUPABASE_SECRET_KEY,
  });
}
