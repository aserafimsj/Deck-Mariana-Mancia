import { z } from "zod";
import { CARD_KINDS, CARD_STATUS, cardInputSchema } from "@/lib/admin-schemas";
import { adminAction, requireStaff } from "@/server/admin-http";
import { errors, readJson } from "@/server/http";

const listQuery = z.object({
  kind: z.enum(CARD_KINDS),
  q: z.string().max(100).optional(),
  level: z.coerce.number().int().min(1).max(4).optional(),
  category: z.string().max(40).optional(),
  status: z.enum(CARD_STATUS).optional(),
  page: z.coerce.number().int().min(1).max(1000).optional(),
  sort: z.enum(["recent", "wins", "plays", "text"]).optional(),
});

export async function GET(request: Request) {
  const ctx = await requireStaff(request);
  if (ctx instanceof Response) return ctx;
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const q = listQuery.safeParse(params);
  if (!q.success) return errors.badRequest("Filtro inválido.");
  const { kind, ...filters } = q.data;
  return adminAction(() => ctx.store.listCards(kind, filters));
}

export async function POST(request: Request) {
  const ctx = await requireStaff(request);
  if (ctx instanceof Response) return ctx;
  const body = await readJson(request, z.object({ kind: z.enum(CARD_KINDS), card: z.unknown() }));
  if (!body) return errors.badRequest();
  const card = cardInputSchema(body.kind).safeParse(body.card);
  if (!card.success) return errors.badRequest(card.error.issues[0]?.message ?? "Carta inválida.");
  return adminAction(() => ctx.store.createCard(body.kind, card.data, ctx.userId));
}
