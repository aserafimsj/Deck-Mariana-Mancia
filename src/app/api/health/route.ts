import { connection } from "next/server";
import { getAdminSupabase } from "@/server/supabase-admin";

type DatabaseStatus = "ok" | "error" | "not_configured";

/** Verificação de saúde para monitoramento e para conferir a configuração após o deploy. */
export async function GET() {
  await connection(); // sempre em tempo de requisição, nunca pré-renderizado

  const admin = getAdminSupabase();
  let database: DatabaseStatus = "not_configured";

  if (admin) {
    try {
      const { error } = await admin.from("decks").select("id", { head: true, count: "exact" }).limit(1);
      database = error ? "error" : "ok";
    } catch {
      database = "error";
    }
  }

  const healthy = database !== "error";
  return Response.json(
    { status: healthy ? "ok" : "degraded", app: "scragbadum", supabase: admin ? "configured" : "not_configured", database },
    { status: healthy ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
}
