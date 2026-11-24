import { grantRoleSchema } from "@/lib/admin-schemas";
import { adminAction, requireStaff } from "@/server/admin-http";
import { errors } from "@/server/http";

export async function GET(request: Request) {
  const ctx = await requireStaff(request, { admin: true });
  if (ctx instanceof Response) return ctx;
  return adminAction(() => ctx.store.listStaff());
}

/** Dá um papel a uma conta existente, pelo e-mail (só administradores). */
export async function POST(request: Request) {
  const ctx = await requireStaff(request, { admin: true });
  if (ctx instanceof Response) return ctx;
  const body = grantRoleSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return errors.badRequest(body.error.issues[0]?.message ?? "Dados inválidos.");
  return adminAction(() => ctx.store.grantRole(body.data.email, body.data.role));
}
