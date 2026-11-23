import { LIMITS, roomSettingsSchema, type RoomSettings } from "@/lib/game-config";
import { nicknameSchema } from "@/lib/nickname";
import { gameError } from "./errors";
import { Rng } from "./rng";
import type {
  ActionContext,
  ActionResult,
  Actor,
  CardPool,
  GameAction,
  GameError,
  GameEvent,
  GameState,
  PlayerState,
  RoundEndReason,
  RoundSummary,
  WhiteCard,
} from "./types";

/** Tempo que um jogador pode ficar sem conexão antes de ser tratado como ausente. */
export const DISCONNECT_GRACE_MS = 60_000;
/** Tempo que o anfitrião pode ficar sem conexão antes de a função passar para outra pessoa. */
export const HOST_GRACE_MS = 30_000;
/** Duração da tela de vencedor da rodada. */
export const RESULT_MS = 8_000;
/** Tempo mínimo do juiz quando há temporizador. */
export const MIN_JUDGING_MS = 60_000;

type Tx = { s: GameState; rng: Rng; now: number; events: GameEvent[]; cards?: CardPool };

// ---------------------------------------------------------------------------
// Criação
// ---------------------------------------------------------------------------

export function createGameState(opts: {
  hostId: string;
  hostNickname: string;
  settings?: Partial<RoomSettings>;
  seed: number;
  now: number;
}): GameState {
  const settings = roomSettingsSchema.parse(opts.settings ?? {});
  const nickname = nicknameSchema.parse(opts.hostNickname);
  return {
    schemaVersion: 1,
    phase: "lobby",
    pausedReason: null,
    hostId: opts.hostId,
    settings,
    players: {
      [opts.hostId]: newPlayer(opts.hostId, nickname, 0, opts.now, settings.humorLevel === 4),
    },
    deck: { black: [], white: [], blackDiscard: [], whiteDiscard: [] },
    round: null,
    lastJudgeId: null,
    roundsPlayed: 0,
    history: [],
    startedAt: null,
    endedAt: null,
    winners: [],
    rng: opts.seed >>> 0,
  };
}

function newPlayer(id: string, nickname: string, seat: number, now: number, acceptedLevel4: boolean): PlayerState {
  return {
    id,
    nickname,
    seat,
    status: "active",
    connected: true,
    disconnectedAt: null,
    acceptedLevel4,
    score: 0,
    roundsWon: 0,
    hand: [],
    joinedAt: now,
  };
}

// ---------------------------------------------------------------------------
// Consultas
// ---------------------------------------------------------------------------

export function isPresent(p: PlayerState, now: number): boolean {
  if (p.status !== "active") return false;
  return p.connected || (p.disconnectedAt !== null && now - p.disconnectedAt < DISCONNECT_GRACE_MS);
}

export function activePlayers(s: GameState): PlayerState[] {
  return Object.values(s.players)
    .filter((p) => p.status === "active")
    .sort((a, b) => a.seat - b.seat);
}

export function presentPlayers(s: GameState, now: number): PlayerState[] {
  return activePlayers(s).filter((p) => isPresent(p, now));
}

const RUNNING = new Set(["submitting", "judging", "round_result"]);

function isRunning(s: GameState) {
  return RUNNING.has(s.phase);
}

function isGameOver(s: GameState): boolean {
  const reachedPoints = Object.values(s.players).some((p) => p.score >= s.settings.pointsToWin);
  const reachedRounds = s.settings.maxRounds !== null && s.roundsPlayed >= s.settings.maxRounds;
  return reachedPoints || reachedRounds;
}

// ---------------------------------------------------------------------------
// Cartas
// ---------------------------------------------------------------------------

function drawWhite(tx: Tx, count: number): WhiteCard[] {
  const { deck } = tx.s;
  const out: WhiteCard[] = [];
  while (out.length < count) {
    if (deck.white.length === 0) {
      if (deck.whiteDiscard.length === 0) break; // acabou de vez: a mão fica incompleta
      deck.white = tx.rng.shuffle(deck.whiteDiscard);
      deck.whiteDiscard = [];
    }
    out.push(deck.white.pop()!);
  }
  return out;
}

function refillHands(tx: Tx) {
  for (const p of activePlayers(tx.s)) {
    const missing = tx.s.settings.handSize - p.hand.length;
    if (missing > 0) p.hand.push(...drawWhite(tx, missing));
  }
}

function drawBlack(tx: Tx) {
  const { deck } = tx.s;
  if (deck.black.length === 0) {
    deck.black = tx.rng.shuffle(deck.blackDiscard);
    deck.blackDiscard = [];
  }
  return deck.black.pop();
}

function discardHand(tx: Tx, p: PlayerState) {
  tx.s.deck.whiteDiscard.push(...p.hand);
  p.hand = [];
}

// ---------------------------------------------------------------------------
// Rodadas
// ---------------------------------------------------------------------------

function nextJudge(s: GameState, now: number, rng: Rng): PlayerState | undefined {
  const present = presentPlayers(s, now);
  if (present.length === 0) return undefined;
  if (s.lastJudgeId === null) return present[rng.int(present.length)];
  const lastSeat = s.players[s.lastJudgeId]?.seat ?? -1;
  return present.find((p) => p.seat > lastSeat) ?? present[0];
}

function startRound(tx: Tx) {
  const { s, now } = tx;
  refillHands(tx);
  const judge = nextJudge(s, now, tx.rng);
  const black = drawBlack(tx);
  if (!judge || !black) return pause(tx);

  s.lastJudgeId = judge.id;
  const seconds = s.settings.answerSeconds;
  s.round = {
    // Rodadas anuladas também contam na numeração (ficam no histórico).
    number: s.history.length + 1,
    judgeId: judge.id,
    blackCard: black,
    startedAt: now,
    deadline: seconds > 0 ? now + seconds * 1000 : null,
    participants: presentPlayers(s, now)
      .filter((p) => p.id !== judge.id)
      .map((p) => p.id),
    submissions: {},
    revealOrder: [],
    revealed: 0,
    winnerId: null,
    nextRoundAt: null,
  };
  s.phase = "submitting";
  tx.events.push({ type: "round_started", number: s.round.number, judgeId: judge.id });
}

function summary(s: GameState, endReason: RoundEndReason): RoundSummary {
  const r = s.round!;
  return {
    number: r.number,
    judgeId: r.judgeId,
    blackCard: r.blackCard,
    winnerId: r.winnerId,
    endReason,
    submissions: Object.entries(r.submissions).map(([playerId, sub]) => ({
      playerId,
      cards: sub.cards,
      ms: sub.submittedAt - r.startedAt,
    })),
  };
}

/** Anula a rodada: respostas voltam para a mão de quem ainda está na sala. */
function cancelRound(tx: Tx, reason: RoundEndReason) {
  const { s } = tx;
  const r = s.round;
  if (!r) return;
  const sum = summary(s, reason);
  for (const [playerId, sub] of Object.entries(r.submissions)) {
    const p = s.players[playerId];
    if (p && p.status === "active") p.hand.push(...sub.cards);
    else s.deck.whiteDiscard.push(...sub.cards);
  }
  s.deck.blackDiscard.push(r.blackCard);
  s.history.push(sum);
  s.round = null;
  tx.events.push({ type: "round_cancelled", summary: sum });
}

function beginJudging(tx: Tx) {
  const { s, now } = tx;
  const r = s.round!;
  r.revealOrder = tx.rng.shuffle(Object.keys(r.submissions));
  r.revealed = 0;
  const seconds = s.settings.answerSeconds;
  r.deadline = seconds > 0 ? now + Math.max(MIN_JUDGING_MS, seconds * 1000) : null;
  s.phase = "judging";
  tx.events.push({ type: "judging_started", answers: r.revealOrder.length });
}

function finishRound(tx: Tx, winnerId: string, reason: RoundEndReason) {
  const { s, now } = tx;
  const r = s.round!;
  r.winnerId = winnerId;
  r.revealed = r.revealOrder.length;
  r.deadline = null;
  r.nextRoundAt = now + RESULT_MS;
  const winner = s.players[winnerId];
  if (winner) {
    winner.score += 1;
    winner.roundsWon += 1;
  }
  s.roundsPlayed += 1;
  for (const sub of Object.values(r.submissions)) s.deck.whiteDiscard.push(...sub.cards);
  s.deck.blackDiscard.push(r.blackCard);
  const sum = summary(s, reason);
  s.history.push(sum);
  s.phase = "round_result";
  tx.events.push({ type: "round_won", summary: sum });
}

function endGame(tx: Tx) {
  const { s, now } = tx;
  const top = Math.max(0, ...Object.values(s.players).map((p) => p.score));
  s.winners = Object.values(s.players)
    .filter((p) => p.score === top && top > 0)
    .sort((a, b) => a.seat - b.seat)
    .map((p) => p.id);
  s.phase = "game_over";
  s.endedAt = now;
  s.round = null;
  tx.events.push({ type: "game_over", winners: s.winners });
}

function pause(tx: Tx) {
  const { s } = tx;
  if (s.phase === "submitting" || s.phase === "judging") cancelRound(tx, "cancelled");
  else s.round = null;
  s.phase = "paused";
  s.pausedReason = "not_enough_players";
  tx.events.push({ type: "paused" });
}

// ---------------------------------------------------------------------------
// Manutenção automática: roda depois de toda ação (inclusive TICK).
// Prazos, desconexões, pausa e retomada são decididos aqui, sempre pelo servidor.
// ---------------------------------------------------------------------------

function housekeeping(tx: Tx) {
  for (let i = 0; i < 6; i++) {
    if (!housekeepingStep(tx)) return;
  }
}

/** Devolve true se mudou algo (para repetir até estabilizar). */
function housekeepingStep(tx: Tx): boolean {
  const { s, now } = tx;
  const min = LIMITS.players.min;

  if (migrateHostIfNeeded(tx)) return true;

  if (isRunning(s) && presentPlayers(s, now).length < min) {
    pause(tx);
    return true;
  }

  if (s.phase === "paused" && presentPlayers(s, now).length >= min) {
    s.pausedReason = null;
    tx.events.push({ type: "resumed" });
    startRound(tx);
    return true;
  }

  const r = s.round;

  if (s.phase === "submitting" && r) {
    const judge = s.players[r.judgeId];
    if (!judge || !isPresent(judge, now)) {
      cancelRound(tx, "judge_left");
      startRound(tx);
      return true;
    }
    const required = r.participants.filter((id) => {
      const p = s.players[id];
      return p && isPresent(p, now);
    });
    const submitted = Object.keys(r.submissions).length;
    const allIn = required.every((id) => r.submissions[id]);
    const timedOut = r.deadline !== null && now >= r.deadline;
    if ((allIn && submitted >= 2) || (timedOut && submitted >= 2)) {
      beginJudging(tx);
      return true;
    }
    if (timedOut || (allIn && required.length < 2)) {
      cancelRound(tx, timedOut ? "timeout" : "cancelled");
      startRound(tx);
      return true;
    }
    return false;
  }

  if (s.phase === "judging" && r) {
    const judge = s.players[r.judgeId];
    if (!judge || !isPresent(judge, now)) {
      cancelRound(tx, "judge_left");
      startRound(tx);
      return true;
    }
    if (r.deadline !== null && now >= r.deadline) {
      const winnerId = r.revealOrder[tx.rng.int(r.revealOrder.length)]!;
      finishRound(tx, winnerId, "timeout");
      return true;
    }
    return false;
  }

  if (s.phase === "round_result" && r && r.nextRoundAt !== null && now >= r.nextRoundAt) {
    advanceAfterResult(tx);
    return true;
  }

  return false;
}

function advanceAfterResult(tx: Tx) {
  if (isGameOver(tx.s)) endGame(tx);
  else startRound(tx);
}

function migrateHostIfNeeded(tx: Tx): boolean {
  const { s, now } = tx;
  const host = s.players[s.hostId];
  const hostGone =
    !host || host.status !== "active" || (!host.connected && host.disconnectedAt !== null && now - host.disconnectedAt >= HOST_GRACE_MS);
  if (!hostGone) return false;
  const candidate = activePlayers(s).find((p) => p.id !== s.hostId && p.connected);
  if (!candidate) return false;
  s.hostId = candidate.id;
  tx.events.push({ type: "host_changed", playerId: candidate.id });
  return true;
}

// ---------------------------------------------------------------------------
// Ações
// ---------------------------------------------------------------------------

function requirePlayer(s: GameState, actor: Actor): PlayerState | GameError {
  if (actor.type !== "player") return gameError("NOT_IN_ROOM");
  const p = s.players[actor.id];
  if (!p) return gameError("NOT_IN_ROOM");
  if (p.status === "kicked") return gameError("KICKED");
  if (p.status !== "active") return gameError("NOT_IN_ROOM");
  return p;
}

function isError(x: unknown): x is GameError {
  return typeof x === "object" && x !== null && "code" in x && "message" in x;
}

function nicknameTaken(s: GameState, nickname: string, exceptId: string): boolean {
  const lower = nickname.toLowerCase();
  return activePlayers(s).some((p) => p.id !== exceptId && p.nickname.toLowerCase() === lower);
}

function handle(tx: Tx, action: GameAction, actor: Actor): GameError | null {
  const { s, now } = tx;

  switch (action.type) {
    case "TICK":
      return null;

    case "SET_CONNECTION": {
      if (actor.type !== "system") return gameError("SYSTEM_ONLY");
      const p = s.players[action.playerId];
      if (!p) return gameError("INVALID_TARGET");
      if (p.connected === action.connected) return null;
      p.connected = action.connected;
      p.disconnectedAt = action.connected ? null : now;
      return null;
    }

    case "JOIN": {
      if (actor.type !== "player") return gameError("NOT_IN_ROOM");
      const parsed = nicknameSchema.safeParse(action.nickname);
      if (!parsed.success) return gameError("INVALID_NICKNAME", parsed.error.issues[0]?.message);
      const nickname = parsed.data;
      const existing = s.players[actor.id];
      if (existing?.status === "kicked") return gameError("KICKED");
      if (nicknameTaken(s, nickname, actor.id)) return gameError("NICKNAME_TAKEN");

      const level4 = s.settings.humorLevel === 4;
      const accepted = (existing?.acceptedLevel4 ?? false) || action.acceptedLevel4 === true;
      if (level4 && !accepted) return gameError("LEVEL4_NOT_ACCEPTED");

      if (existing?.status === "active") {
        // Reconexão: mesmo jogador abrindo o link de novo.
        existing.connected = true;
        existing.disconnectedAt = null;
        existing.nickname = nickname;
        existing.acceptedLevel4 = accepted;
        return null;
      }

      if (activePlayers(s).length >= s.settings.maxPlayers) return gameError("ROOM_FULL");

      if (existing) {
        existing.status = "active";
        existing.connected = true;
        existing.disconnectedAt = null;
        existing.nickname = nickname;
        existing.acceptedLevel4 = accepted;
      } else {
        const seat = Math.max(-1, ...Object.values(s.players).map((p) => p.seat)) + 1;
        s.players[actor.id] = newPlayer(actor.id, nickname, seat, now, accepted);
      }
      const player = s.players[actor.id]!;
      if (isRunning(s) || s.phase === "paused") player.hand.push(...drawWhite(tx, s.settings.handSize - player.hand.length));
      tx.events.push({ type: "player_joined", playerId: actor.id, rejoined: existing !== undefined });
      return null;
    }

    case "LEAVE":
    case "KICK": {
      const me = requirePlayer(s, actor);
      if (isError(me)) return me;
      let target = me;
      if (action.type === "KICK") {
        if (s.hostId !== me.id) return gameError("NOT_HOST");
        const t = s.players[action.playerId];
        if (!t || t.status !== "active" || t.id === me.id) return gameError("INVALID_TARGET");
        target = t;
      }
      target.status = action.type === "KICK" ? "kicked" : "left";
      target.connected = false;
      target.disconnectedAt = now;
      // Resposta ainda não revelada de quem saiu volta ao baralho.
      const r = s.round;
      if (r && s.phase === "submitting" && r.submissions[target.id]) {
        s.deck.whiteDiscard.push(...r.submissions[target.id]!.cards);
        delete r.submissions[target.id];
      }
      discardHand(tx, target);
      tx.events.push(action.type === "KICK" ? { type: "player_kicked", playerId: target.id } : { type: "player_left", playerId: target.id });
      return null;
    }

    case "TRANSFER_HOST": {
      const me = requirePlayer(s, actor);
      if (isError(me)) return me;
      if (s.hostId !== me.id) return gameError("NOT_HOST");
      const t = s.players[action.playerId];
      if (!t || t.status !== "active" || t.id === me.id) return gameError("INVALID_TARGET");
      s.hostId = t.id;
      tx.events.push({ type: "host_changed", playerId: t.id });
      return null;
    }

    case "UPDATE_SETTINGS": {
      const me = requirePlayer(s, actor);
      if (isError(me)) return me;
      if (s.hostId !== me.id) return gameError("NOT_HOST");
      if (s.phase !== "lobby") return gameError("WRONG_PHASE");
      const parsed = roomSettingsSchema.safeParse({ ...s.settings, ...action.settings });
      if (!parsed.success) return gameError("INVALID_SETTINGS");
      if (parsed.data.maxPlayers < activePlayers(s).length) {
        return gameError("INVALID_SETTINGS", "Já tem mais gente na sala do que esse limite.");
      }
      s.settings = parsed.data;
      if (parsed.data.humorLevel === 4) me.acceptedLevel4 = true;
      tx.events.push({ type: "settings_changed" });
      return null;
    }

    case "ACCEPT_LEVEL4": {
      const me = requirePlayer(s, actor);
      if (isError(me)) return me;
      me.acceptedLevel4 = true;
      return null;
    }

    case "START_GAME": {
      const me = requirePlayer(s, actor);
      if (isError(me)) return me;
      if (s.hostId !== me.id) return gameError("NOT_HOST");
      if (s.phase !== "lobby") return gameError("WRONG_PHASE");
      if (presentPlayers(s, now).length < LIMITS.players.min) return gameError("NOT_ENOUGH_PLAYERS");
      if (s.settings.humorLevel === 4 && activePlayers(s).some((p) => !p.acceptedLevel4)) return gameError("LEVEL4_NOT_ACCEPTED");

      // Defesa em profundidade: o servidor já filtra, mas o motor nunca usa carta acima do nível da sala.
      const level = s.settings.humorLevel;
      const black = (tx.cards?.black ?? []).filter((c) => c.humorLevel <= level).map(({ id, text, pick }) => ({ id, text, pick }));
      const white = (tx.cards?.white ?? []).filter((c) => c.humorLevel <= level).map(({ id, text }) => ({ id, text }));
      // Mínimo: mãos cheias + uma rodada de respostas. Depois, o descarte é reembaralhado.
      const players = activePlayers(s).length;
      if (black.length < 1 || white.length < players * (s.settings.handSize + 1)) {
        return gameError("NOT_ENOUGH_CARDS");
      }

      s.deck = { black: tx.rng.shuffle(black), white: tx.rng.shuffle(white), blackDiscard: [], whiteDiscard: [] };
      for (const p of Object.values(s.players)) {
        p.hand = [];
        p.score = 0;
        p.roundsWon = 0;
      }
      s.round = null;
      s.lastJudgeId = null;
      s.roundsPlayed = 0;
      s.history = [];
      s.winners = [];
      s.startedAt = now;
      s.endedAt = null;
      tx.events.push({ type: "game_started" });
      startRound(tx);
      return null;
    }

    case "SUBMIT": {
      const me = requirePlayer(s, actor);
      if (isError(me)) return me;
      const r = s.round;
      if (s.phase !== "submitting" || !r) return gameError("WRONG_PHASE");
      if (r.judgeId === me.id) return gameError("JUDGE_CANNOT_ANSWER");
      if (!r.participants.includes(me.id)) return gameError("NOT_PARTICIPANT");
      if (r.submissions[me.id]) return gameError("ALREADY_SUBMITTED");
      const ids = action.cardIds;
      if (!Array.isArray(ids) || ids.length !== r.blackCard.pick || new Set(ids).size !== ids.length) {
        return gameError("INVALID_CARDS");
      }
      const cards = ids.map((id) => me.hand.find((c) => c.id === id));
      if (cards.some((c) => c === undefined)) return gameError("INVALID_CARDS");
      me.hand = me.hand.filter((c) => !ids.includes(c.id));
      r.submissions[me.id] = { cards: cards as WhiteCard[], submittedAt: now };
      tx.events.push({ type: "answer_submitted", playerId: me.id });
      return null;
    }

    case "REVEAL_NEXT": {
      const me = requirePlayer(s, actor);
      if (isError(me)) return me;
      const r = s.round;
      if (s.phase !== "judging" || !r) return gameError("WRONG_PHASE");
      if (r.judgeId !== me.id) return gameError("NOT_JUDGE");
      if (r.revealed < r.revealOrder.length) {
        r.revealed += 1;
        tx.events.push({ type: "answer_revealed", index: r.revealed - 1 });
      }
      return null;
    }

    case "PICK_WINNER": {
      const me = requirePlayer(s, actor);
      if (isError(me)) return me;
      const r = s.round;
      if (s.phase !== "judging" || !r) return gameError("WRONG_PHASE");
      if (r.judgeId !== me.id) return gameError("NOT_JUDGE");
      if (r.revealed < r.revealOrder.length) return gameError("NOT_ALL_REVEALED");
      const winnerId = Number.isInteger(action.answerIndex) ? r.revealOrder[action.answerIndex] : undefined;
      if (winnerId === undefined) return gameError("INVALID_ANSWER");
      finishRound(tx, winnerId, "judged");
      return null;
    }

    case "NEXT_ROUND": {
      const me = requirePlayer(s, actor);
      if (isError(me)) return me;
      if (s.hostId !== me.id) return gameError("NOT_HOST");
      if (s.phase !== "round_result") return gameError("WRONG_PHASE");
      advanceAfterResult(tx);
      return null;
    }

    case "PLAY_AGAIN": {
      const me = requirePlayer(s, actor);
      if (isError(me)) return me;
      if (s.hostId !== me.id) return gameError("NOT_HOST");
      if (s.phase !== "game_over") return gameError("WRONG_PHASE");
      for (const p of Object.values(s.players)) {
        p.hand = [];
        p.score = 0;
        p.roundsWon = 0;
      }
      s.deck = { black: [], white: [], blackDiscard: [], whiteDiscard: [] };
      s.phase = "lobby";
      s.pausedReason = null;
      s.round = null;
      s.lastJudgeId = null;
      s.roundsPlayed = 0;
      s.history = [];
      s.winners = [];
      s.startedAt = null;
      s.endedAt = null;
      tx.events.push({ type: "back_to_lobby" });
      return null;
    }
  }
}

const MAYBE_NOOP = new Set<GameAction["type"]>(["TICK", "SET_CONNECTION", "JOIN", "ACCEPT_LEVEL4", "REVEAL_NEXT", "UPDATE_SETTINGS"]);

/**
 * Aplica uma ação ao estado. Função pura: não altera `state`, não lê relógio nem sorteia
 * fora do gerador com semente. Toda validação de regra acontece aqui.
 */
export function applyAction(state: GameState, action: GameAction, actor: Actor, ctx: ActionContext): ActionResult {
  const draft = structuredClone(state);
  const tx: Tx = { s: draft, rng: new Rng(draft.rng), now: ctx.now, events: [], cards: ctx.cards };
  const error = handle(tx, action, actor);
  if (error) return { ok: false, error };
  housekeeping(tx);
  draft.rng = tx.rng.state;
  // Só estas ações podem terminar sem mudar nada; nas demais, sucesso sempre muda o estado.
  // (Comparar o estado inteiro custa caro, então só fazemos quando é necessário.)
  const changed = MAYBE_NOOP.has(action.type) ? JSON.stringify(draft) !== JSON.stringify(state) : true;
  return { ok: true, state: draft, events: tx.events, changed };
}
