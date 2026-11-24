import { createRoomBody } from "@/lib/api-schemas";
import { createRoom } from "@/server/game-service";
import { authenticate, clientIp, errors, fromService, getDeps, limits, readJson } from "@/server/http";

/** Cria uma sala. Quem cria vira o anfitrião. */
export async function POST(request: Request) {
  const deps = getDeps();
  if (!deps) return errors.notConfigured();
  const userId = await authenticate(request);
  if (!userId) return errors.unauthorized();
  if (!(await limits.create(userId, clientIp(request)))) return errors.rateLimited();
  const body = await readJson(request, createRoomBody);
  if (!body) return errors.badRequest();
  return fromService(await createRoom(deps, userId, body));
}
