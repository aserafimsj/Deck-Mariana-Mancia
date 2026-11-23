import { expect } from "vitest";
import { applyAction, createGameState, projectFor, type Actor, type CardPool, type GameAction, type GameState } from "@/engine";
import type { RoomSettings } from "@/lib/game-config";

export const T0 = 1_700_000_000_000;

export function makePool(black = 30, white = 200, opts: { pick2Every?: number; level?: 1 | 2 | 3 | 4 } = {}): CardPool {
  const level = opts.level ?? 1;
  return {
    black: Array.from({ length: black }, (_, i) => {
      const pick = opts.pick2Every && i % opts.pick2Every === 0 ? 2 : 1;
      return { id: `b${i}`, text: pick === 2 ? `Pergunta ${i}: ___ e ___.` : `Pergunta ${i}: ___.`, pick: pick as 1 | 2, humorLevel: level };
    }),
    white: Array.from({ length: white }, (_, i) => ({ id: `w${i}`, text: `Resposta ${i}.`, humorLevel: level })),
  };
}

export const p = (id: string): Actor => ({ type: "player", id });
export const SYSTEM: Actor = { type: "system" };

/** Aplica e exige sucesso. */
export function ok(state: GameState, action: GameAction, actor: Actor, now = T0, cards?: CardPool): GameState {
  const r = applyAction(state, action, actor, { now, cards });
  if (!r.ok) throw new Error(`Ação ${action.type} de ${actor.type === "player" ? actor.id : "system"} falhou: ${r.error.code}`);
  return r.state;
}

/** Aplica e exige o erro indicado; o estado não pode mudar. */
export function fails(state: GameState, action: GameAction, actor: Actor, code: string, now = T0, cards?: CardPool) {
  const before = JSON.stringify(state);
  const r = applyAction(state, action, actor, { now, cards });
  expect(r.ok, `esperava erro ${code}`).toBe(false);
  if (!r.ok) expect(r.error.code).toBe(code);
  expect(JSON.stringify(state)).toBe(before);
}

/** Sala com `n` jogadores (p0 é o anfitrião), ainda no lobby. */
export function lobby(n: number, settings: Partial<RoomSettings> = {}, seed = 42): GameState {
  let s = createGameState({ hostId: "p0", hostNickname: "Jogador 0", settings, seed, now: T0 });
  for (let i = 1; i < n; i++) s = ok(s, { type: "JOIN", nickname: `Jogador ${i}`, acceptedLevel4: true }, p(`p${i}`));
  return s;
}

/** Partida iniciada com `n` jogadores. */
export function started(n: number, settings: Partial<RoomSettings> = {}, seed = 42, pool = makePool()): GameState {
  return ok(lobby(n, settings, seed), { type: "START_GAME" }, p("p0"), T0, pool);
}

/** Todos os participantes respondem com a(s) primeira(s) carta(s) da mão. */
export function everyoneSubmits(s: GameState, now = T0): GameState {
  const r = s.round!;
  for (const id of r.participants) {
    if (s.phase !== "submitting") break;
    const player = s.players[id]!;
    if (player.status !== "active" || s.round!.submissions[id]) continue;
    s = ok(s, { type: "SUBMIT", cardIds: player.hand.slice(0, r.blackCard.pick).map((c) => c.id) }, p(id), now);
  }
  return s;
}

/** Juiz revela tudo e escolhe a resposta `index`. */
export function judgePicks(s: GameState, index = 0, now = T0): GameState {
  const judge = p(s.round!.judgeId);
  while (s.round!.revealed < s.round!.revealOrder.length) s = ok(s, { type: "REVEAL_NEXT" }, judge, now);
  return ok(s, { type: "PICK_WINNER", answerIndex: index }, judge, now);
}

/** Todas as cartas brancas em jogo: baralho, descarte, mãos e respostas da rodada. */
export function allWhiteIds(s: GameState): string[] {
  const ids = [...s.deck.white, ...s.deck.whiteDiscard].map((c) => c.id);
  for (const pl of Object.values(s.players)) ids.push(...pl.hand.map((c) => c.id));
  if (s.round && s.phase !== "round_result") for (const sub of Object.values(s.round.submissions)) ids.push(...sub.cards.map((c) => c.id));
  return ids;
}

/**
 * Verifica, para um jogador, que a visão não contém nada que ele não deveria ver.
 * Usada nos testes de projeção e em milhares de passos da simulação.
 * Junta todos os problemas e faz uma única verificação (bem mais rápido).
 */
export function leaksFor(s: GameState, viewerId: string, now = T0): string[] {
  const view = projectFor(s, viewerId, now);
  const json = JSON.stringify(view);
  // Todos os textos entre aspas da visão, uma vez só (ids aparecem como "w12", "b3"...).
  const strings = new Set(json.match(/"[^"]*"/g)?.map((x) => x.slice(1, -1)) ?? []);
  const has = (id: string) => strings.has(id);
  const problems: string[] = [];

  // Baralho e descarte nunca saem do servidor. Exceção legítima: na tela de resultado,
  // as respostas e a pergunta da rodada já foram para o descarte, mas continuam à mostra.
  const shownNow = new Set<string>();
  if (s.phase === "round_result" && s.round) {
    shownNow.add(s.round.blackCard.id);
    for (const sub of Object.values(s.round.submissions)) for (const c of sub.cards) shownNow.add(c.id);
  }
  for (const c of [...s.deck.white, ...s.deck.whiteDiscard]) if (!shownNow.has(c.id) && has(c.id)) problems.push(`baralho vazou: ${c.id}`);
  for (const c of [...s.deck.black, ...s.deck.blackDiscard]) if (!shownNow.has(c.id) && has(c.id)) problems.push(`pergunta futura vazou: ${c.id}`);

  // Mãos dos outros nunca aparecem.
  for (const other of Object.values(s.players)) {
    if (other.id === viewerId) continue;
    for (const c of other.hand) if (has(c.id)) problems.push(`mão de ${other.id} vazou: ${c.id}`);
  }

  const r = s.round;
  if (r && s.phase === "submitting") {
    for (const [author, sub] of Object.entries(r.submissions)) {
      if (author === viewerId) continue;
      for (const c of sub.cards) if (has(c.id)) problems.push(`resposta de ${author} vazou antes do julgamento`);
    }
  }
  if (r && s.phase === "judging") {
    r.revealOrder.forEach((author, i) => {
      if (i >= r.revealed && author !== viewerId) {
        for (const c of r.submissions[author]!.cards) if (has(c.id)) problems.push("resposta não revelada vazou");
      }
    });
    if (view.round!.answers.some((a) => a.playerId !== null)) problems.push("autor revelado antes da escolha");
    if (json.includes("revealOrder")) problems.push("ordem interna exposta");
  }
  return problems;
}

export function assertNoLeak(s: GameState, viewerId: string, now = T0) {
  expect(leaksFor(s, viewerId, now)).toEqual([]);
}
