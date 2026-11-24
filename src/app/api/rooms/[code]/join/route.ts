import { joinRoomBody } from "@/lib/api-schemas";
import { joinRoom } from "@/server/game-service";
import { authenticate, clientIp, errors, fromService, getDeps, limits, readJson } from "@/server/http";

/** Entra na sala (ou volta para ela, se já estava). */
export async function POST(request: Request, ctx: RouteContext<"/api/rooms/[code]/join">) {
  const deps = getDeps();
  if (!deps) return errors.notConfigured();
  const userId = await authenticate(request);
  if (!userId) return errors.unauthorized();
  // Limite por IP também: dificulta tentar códigos de sala em massa.
  if (!limits.action(userId) || !(await limits.join(clientIp(request)))) return errors.rateLimited();
  const body = await readJson(request, joinRoomBody);
  if (!body) return errors.badRequest();
  const { code } = await ctx.params;
  return fromService(await joinRoom(deps, userId, code, body));
}
