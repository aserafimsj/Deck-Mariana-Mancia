import { viewRoom } from "@/server/game-service";
import { authenticate, clientIp, errors, fromService, getDeps, limits } from "@/server/http";

/**
 * Visão do jogador na sala. Também serve de sinal de vida (o celular chama a cada poucos segundos)
 * e é o momento em que o servidor confere prazos e desconexões.
 */
export async function GET(request: Request, ctx: RouteContext<"/api/rooms/[code]">) {
  const deps = getDeps();
  if (!deps) return errors.notConfigured();
  const userId = await authenticate(request);
  if (!userId) return errors.unauthorized();
  // Por usuário e por IP: quem não está na sala também consegue ver a parte pública, então limita varreduras.
  if (!limits.action(`view:${userId}`) || !limits.viewByIp(clientIp(request))) return errors.rateLimited();
  const { code } = await ctx.params;
  return fromService(await viewRoom(deps, userId, code));
}
