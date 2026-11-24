import { categoryInputSchema } from "@/lib/admin-schemas";
import { adminAction, requireStaff } from "@/server/admin-http";
import { errors } from "@/server/http";

export async function GET(request: Request) {
  const ctx = await requireStaff(request);
  if (ctx instanceof Response) return ctx;
  return adminAction(() => ctx.store.listCategories());
}

export async function POST(request: Request) {
  const ctx = await requireStaff(request);
  if (ctx instanceof Response) return ctx;
  const body = categoryInputSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return errors.badRequest(body.error.issues[0]?.message ?? "Categoria inválida.");
  return adminAction(() => ctx.store.createCategory(body.data));
}
