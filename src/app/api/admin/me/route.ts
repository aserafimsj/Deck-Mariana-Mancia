import { requireStaff } from "@/server/admin-http";
import { json } from "@/server/http";

export async function GET(request: Request) {
  const ctx = await requireStaff(request);
  if (ctx instanceof Response) return ctx;
  return json({ userId: ctx.userId, roles: ctx.roles, isAdmin: ctx.isAdmin });
}
