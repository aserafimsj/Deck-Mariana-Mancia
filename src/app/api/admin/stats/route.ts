import { adminAction, requireStaff } from "@/server/admin-http";

export async function GET(request: Request) {
  const ctx = await requireStaff(request);
  if (ctx instanceof Response) return ctx;
  return adminAction(() => ctx.store.stats());
}
