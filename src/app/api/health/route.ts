import { connection } from "next/server";
import { getPool } from "@/server/store";
import { getAdminSupabase } from "@/server/supabase-admin";

type Check = "ok" | "error" | "not_configured";

/**
 * Verificação de saúde para monitoramento e para conferir a configuração depois do deploy.
 * Não expõe detalhes internos: só o estado de cada peça e uma dica de correção quando reconhecida.
 */
export async function GET() {
  await connection(); // sempre em tempo de requisição

  let database: Check = "not_configured";
  let hint: string | undefined;
  const dbUrl = process.env.SUPABASE_DB_URL;
  if (dbUrl) {
    try {
      await getPool(dbUrl).query("select 1 from public.decks limit 1");
      database = "ok";
    } catch (e) {
      database = "error";
      const code = String((e as { code?: string }).code ?? "");
      if (/CERT|SELF_SIGNED|UNABLE_TO_VERIFY/.test(code)) hint = "Configure SUPABASE_DB_CA_CERT com o certificado do Supabase (veja o README).";
      else if (code === "42P01") hint = "Tabelas não encontradas: aplique as migrations.";
    }
  }

  const supabase: Check = getAdminSupabase() ? "ok" : "not_configured";
  const healthy = database !== "error";
  return Response.json(
    { status: healthy ? "ok" : "degraded", app: "scragbadum", database, supabase, ...(hint ? { hint } : {}) },
    { status: healthy ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
}
