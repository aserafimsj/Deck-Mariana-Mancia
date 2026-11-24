import { z } from "zod";
import { CARD_KINDS, parseCardsCsv } from "@/lib/admin-schemas";
import { adminAction, requireStaff } from "@/server/admin-http";
import { errorResponse, errors, readJson } from "@/server/http";

/**
 * Importação em lote. `dryRun: true` só valida e mostra o que entraria.
 * Qualquer linha com erro bloqueia a importação inteira (nada entra pela metade).
 */
export async function POST(request: Request) {
  const ctx = await requireStaff(request);
  if (ctx instanceof Response) return ctx;
  const body = await readJson(request, z.object({ kind: z.enum(CARD_KINDS), csv: z.string().max(500_000), dryRun: z.boolean().default(false) }), 600 * 1024);
  if (!body) return errors.badRequest();
  const parsed = parseCardsCsv(body.csv, body.kind);
  if (parsed.rows.length > 2000) return errorResponse(413, "TOO_MANY", "No máximo 2.000 cartas por importação.");
  if (body.dryRun || parsed.errors.length) return Response.json({ valid: parsed.rows.length, errors: parsed.errors, imported: false }, { status: parsed.errors.length ? 422 : 200 });
  return adminAction(async () => ({ ...(await ctx.store.importCards(body.kind, parsed.rows, ctx.userId)), valid: parsed.rows.length, errors: [], imported: true }));
}
