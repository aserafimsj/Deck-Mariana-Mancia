import { z } from "zod";
import { categoryPatchSchema } from "@/lib/admin-schemas";
import { adminAction, requireStaff } from "@/server/admin-http";
import { errors, readJson } from "@/server/http";

export async function PATCH(request: Request, ctx: RouteContext<"/api/admin/categories/[slug]">) {
  const staff = await requireStaff(request);
  if (staff instanceof Response) return staff;
  const { slug } = await ctx.params;
  const body = categoryPatchSchema.safeParse(await readJson(request, z.unknown()));
  if (!body.success) return errors.badRequest(body.error.issues[0]?.message ?? "Alteração inválida.");
  return adminAction(() => staff.store.updateCategory(slug, body.data));
}
