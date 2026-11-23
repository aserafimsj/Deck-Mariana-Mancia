import { actionBody } from "@/lib/api-schemas";
import { act } from "@/server/game-service";
import { authenticate, errors, fromService, getDeps, limits, readJson } from "@/server/http";

/** Ações de jogo. O servidor valida tudo; o celular só pede. */
export async function POST(request: Request, ctx: RouteContext<"/api/rooms/[code]/actions">) {
  const deps = getDeps();
  if (!deps) return errors.notConfigured();
  const userId = await authenticate(request);
  if (!userId) return errors.unauthorized();
  if (!limits.action(userId)) return errors.rateLimited();
  const body = await readJson(request, actionBody);
  if (!body) return errors.badRequest("Ação inválida.");
  const { code } = await ctx.params;
  return fromService(await act(deps, userId, code, body.action, body.clientActionId));
}
