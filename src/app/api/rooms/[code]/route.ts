import { viewRoom } from "@/server/game-service";
import { authenticate, errors, fromService, getDeps, limits } from "@/server/http";

/**
 * Visão do jogador na sala. Também serve de sinal de vida (o celular chama a cada poucos segundos)
 * e é o momento em que o servidor confere prazos e desconexões.
 */
export async function GET(request: Request, ctx: RouteContext<"/api/rooms/[code]">) {
  const deps = getDeps();
  if (!deps) return errors.notConfigured();
  const userId = await authenticate(request);
  if (!userId) return errors.unauthorized();
  if (!limits.action(`view:${userId}`)) return errors.rateLimited();
  const { code } = await ctx.params;
  return fromService(await viewRoom(deps, userId, code));
}
