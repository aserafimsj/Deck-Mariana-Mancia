import { z } from "zod";
import { CARD_KINDS, cardPatchSchema } from "@/lib/admin-schemas";
import { adminAction, requireStaff } from "@/server/admin-http";
import { errors, readJson } from "@/server/http";

const params = z.object({ kind: z.enum(CARD_KINDS), id: z.uuid() });

/** Editar carta (equipe). */
export async function PATCH(request: Request, ctx: RouteContext<"/api/admin/cards/[kind]/[id]">) {
  const staff = await requireStaff(request);
  if (staff instanceof Response) return staff;
  const p = params.safeParse(await ctx.params);
  if (!p.success) return errors.badRequest();
  const body = cardPatchSchema(p.data.kind).safeParse(await readJson(request, z.unknown()));
  if (!body.success) return errors.badRequest(body.error.issues[0]?.message ?? "Alteração inválida.");
  return adminAction(() => staff.store.updateCard(p.data.kind, p.data.id, body.data));
}

/** Apagar carta nunca usada (só administradores). */
export async function DELETE(request: Request, ctx: RouteContext<"/api/admin/cards/[kind]/[id]">) {
  const staff = await requireStaff(request, { admin: true });
  if (staff instanceof Response) return staff;
  const p = params.safeParse(await ctx.params);
  if (!p.success) return errors.badRequest();
  return adminAction(() => staff.store.deleteCard(p.data.kind, p.data.id));
}
