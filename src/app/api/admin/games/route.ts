import { adminAction, requireStaff } from "@/server/admin-http";

export async function GET(request: Request) {
  const ctx = await requireStaff(request);
  if (ctx instanceof Response) return ctx;
  const page = Math.max(1, Math.min(1000, Number(new URL(request.url).searchParams.get("page")) || 1));
  return adminAction(() => ctx.store.listGames(page));
}
