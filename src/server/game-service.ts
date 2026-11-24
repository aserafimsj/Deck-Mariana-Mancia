import { randomUUID } from "node:crypto";
import { applyAction, createGameState, projectFor, seedFromBytes, type Actor, type GameAction, type GameError, type GameEvent, type GameState, type PlayerView } from "@/engine";
import { roomSettingsSchema, type RoomSettings } from "@/lib/game-config";
import { nicknameSchema } from "@/lib/nickname";
import { generateRoomCode, isValidRoomCode, normalizeRoomCode } from "@/lib/room-code";
import { CodeTakenError, type Store } from "./store";

/**
 * Orquestra uma requisição de jogo: carrega o estado, aplica a ação no motor,
 * grava com controle de versão (tentando de novo se outra ação chegou antes),
 * avisa os outros jogadores e devolve a visão de quem pediu.
 */

/** Sem sinal de vida por este tempo = desconectado (o celular avisa a cada poucos segundos). */
export const SILENCE_MS = 20_000;
const MAX_ATTEMPTS = 4;

export type Notifier = (code: string, version: number) => Promise<void>;

export type Deps = {
  store: Store;
  notify: Notifier;
  now: () => number;
  randomBytes: (n: number) => Uint8Array;
};

export type RoomResponse = { code: string; version: number; serverNow: number; view: PlayerView };

export type ServiceError = { status: number; code: string; message: string };
export type ServiceResult = { ok: true; data: RoomResponse } | { ok: false; error: ServiceError };

const fail = (status: number, code: string, message: string): ServiceResult => ({ ok: false, error: { status, code, message } });

function fromGameError(e: GameError): ServiceResult {
  const status = e.code === "KICKED" || e.code === "NOT_IN_ROOM" ? 403 : e.code === "ROOM_FULL" || e.code === "NICKNAME_TAKEN" ? 409 : 422;
  return fail(status, e.code, e.message);
}

const ROOM_NOT_FOUND = () => fail(404, "ROOM_NOT_FOUND", "Essa sala não existe ou a festa já acabou. Confere o código?");

function respond(code: string, version: number, state: GameState, userId: string, now: number): ServiceResult {
  return { ok: true, data: { code, version, serverNow: now, view: projectFor(state, userId, now) } };
}

export async function createRoom(deps: Deps, userId: string, input: { nickname: string; settings?: Partial<RoomSettings> }): Promise<ServiceResult> {
  const nickname = nicknameSchema.safeParse(input.nickname);
  if (!nickname.success) return fail(422, "INVALID_NICKNAME", nickname.error.issues[0]?.message ?? "Apelido inválido.");
  const settings = roomSettingsSchema.safeParse(input.settings ?? {});
  if (!settings.success) return fail(422, "INVALID_SETTINGS", "Configuração inválida.");

  await deps.store.ensureAuthUser(userId);
  const now = deps.now();
  const state = createGameState({
    hostId: userId,
    hostNickname: nickname.data,
    settings: settings.data,
    seed: seedFromBytes(deps.randomBytes(4)),
    now,
  });

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateRoomCode(deps.randomBytes);
    try {
      await deps.store.createRoom({ code, hostId: userId, nickname: nickname.data, state });
      return respond(code, 1, state, userId, now);
    } catch (error) {
      if (!(error instanceof CodeTakenError)) throw error;
    }
  }
  return fail(503, "TRY_AGAIN", "Não conseguimos criar a sala agora. Tenta de novo.");
}

type Plan = {
  /** Ação principal (ou null para só manutenção: sinal de vida, prazos). */
  action: GameAction | null;
  clientActionId: string | null;
};

async function transition(deps: Deps, userId: string, rawCode: string, plan: Plan): Promise<ServiceResult> {
  const code = normalizeRoomCode(rawCode);
  if (!isValidRoomCode(code)) return ROOM_NOT_FOUND();
  const room = await deps.store.getOpenRoom(code);
  if (!room) return ROOM_NOT_FOUND();

  const isJoin = plan.action?.type === "JOIN";
  await deps.store.touch(room.id, userId);
  const silent = new Set(await deps.store.silentPlayers(room.id, SILENCE_MS));
  const clientActionId = plan.clientActionId ?? randomUUID();

  // Reenvio de uma ação já aplicada (resposta perdida no caminho): devolve o estado atual, sem reaplicar.
  if (plan.clientActionId && (await deps.store.processedAction(room.id, plan.clientActionId)) !== null) {
    const current = await deps.store.loadState(room.id);
    if (current) return respond(code, current.version, current.state, userId, deps.now());
  }

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const loaded = await deps.store.loadState(room.id);
    if (!loaded) return ROOM_NOT_FOUND();
    const now = deps.now();
    let state = loaded.state;
    const me = state.players[userId];

    if (!isJoin && (!me || me.status !== "active")) {
      if (me?.status === "kicked") return fail(403, "KICKED", "Você foi removido desta sala pelo anfitrião.");
      // Quem não está na sala só enxerga a visão pública (para mostrar a tela de entrada).
      if (plan.action === null) return respond(code, loaded.version, state, userId, now);
      return fail(403, "NOT_IN_ROOM", "Você não está nesta sala. Entra de novo pelo código.");
    }

    // Presença: quem pediu está online; quem sumiu há tempo demais fica offline.
    const system: Actor = { type: "system" };
    const presence: GameAction[] = [];
    if (me && me.status === "active" && !me.connected) presence.push({ type: "SET_CONNECTION", playerId: userId, connected: true });
    for (const p of Object.values(state.players)) {
      if (p.id !== userId && p.status === "active" && p.connected && silent.has(p.id)) {
        presence.push({ type: "SET_CONNECTION", playerId: p.id, connected: false });
      }
    }
    let changed = false;
    const events: GameEvent[] = [];
    for (const a of presence) {
      const r = applyAction(state, a, system, { now });
      if (r.ok) {
        state = r.state;
        changed ||= r.changed;
        events.push(...r.events);
      }
    }

    // Ação principal (a validação de regra é toda do motor).
    const action = plan.action ?? { type: "TICK" };
    const ctx = action.type === "START_GAME" ? { now, cards: await deps.store.loadCards(state.settings.humorLevel, state.settings.categorySlugs) } : { now };
    const result = applyAction(state, action, { type: "player", id: userId }, ctx);
    if (!result.ok) {
      // Mesmo com erro, grava a presença atualizada para não perder a informação.
      if (changed) await deps.store.commit({ roomId: room.id, expectedVersion: loaded.version, state, actorId: null, clientActionId: randomUUID(), type: "PRESENCE", payload: {} });
      return fromGameError(result.error);
    }
    state = result.state;
    changed ||= result.changed;
    events.push(...result.events);

    if (!changed) return respond(code, loaded.version, state, userId, now);

    const committed = await deps.store.commit({
      roomId: room.id,
      expectedVersion: loaded.version,
      state,
      actorId: userId,
      clientActionId,
      type: action.type,
      payload: action.type === "SUBMIT" ? { cards: action.cardIds.length } : {},
    });

    if (committed.status === "conflict") continue; // outra ação chegou antes: recarrega e reaplica
    if (committed.status === "duplicate") {
      const current = await deps.store.loadState(room.id);
      return respond(code, current!.version, current!.state, userId, deps.now());
    }

    // Efeitos depois de gravar: espelho público e aviso. Falhas aqui não desfazem a jogada.
    await deps.store.syncRoom(room.id, state).catch((e) => console.error("syncRoom falhou", e));
    await deps.store.recordHistory(room.id, state, events).catch((e) => console.error("recordHistory falhou", e));
    await deps.notify(code, committed.version).catch((e) => console.error("notify falhou", e));
    return respond(code, committed.version, state, userId, now);
  }

  return fail(409, "BUSY", "Muita gente jogando ao mesmo tempo. Tenta de novo.");
}

export function joinRoom(deps: Deps, userId: string, code: string, input: { nickname: string; acceptedLevel4?: boolean }) {
  return deps.store.ensureAuthUser(userId).then(() =>
    transition(deps, userId, code, { action: { type: "JOIN", nickname: input.nickname, acceptedLevel4: input.acceptedLevel4 }, clientActionId: null }),
  );
}

/** Visão + sinal de vida + manutenção de prazos. O celular chama a cada poucos segundos. */
export function viewRoom(deps: Deps, userId: string, code: string) {
  return transition(deps, userId, code, { action: null, clientActionId: null });
}

export function act(deps: Deps, userId: string, code: string, action: GameAction, clientActionId: string) {
  return transition(deps, userId, code, { action, clientActionId });
}
