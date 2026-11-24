import { z } from "zod";
import { ROLES } from "@/lib/admin-schemas";
import { adminAction, requireStaff } from "@/server/admin-http";
import { errors } from "@/server/http";

export async function DELETE(request: Request, ctx: RouteContext<"/api/admin/staff/[userId]">) {
  const staff = await requireStaff(request, { admin: true });
  if (staff instanceof Response) return staff;
  const { userId } = await ctx.params;
  const role = z.enum(ROLES).safeParse(new URL(request.url).searchParams.get("role"));
  if (!z.uuid().safeParse(userId).success || !role.success) return errors.badRequest();
  return adminAction(() => staff.store.revokeRole(userId, role.data, staff.userId));
}
