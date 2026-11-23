import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { applyAction, Rng, type Actor, type GameAction, type GameState } from "@/engine";
import { LIMITS } from "@/lib/game-config";
import { allWhiteIds, assertNoLeak, lobby, makePool, T0 } from "./helpers";

/**
 * Simulação: milhares de partidas com jogadores fazendo coisas aleatórias
 * (inclusive inválidas, fora de hora, cliques duplos, quedas de rede, saídas e entradas).
 * Depois de cada passo, checamos as invariantes do jogo e o sigilo de cada visão.
 */

// Padrão rápido para o dia a dia; para uma rodada pesada: SIM_GAMES=3000 pnpm test
const GAMES = Number(process.env.SIM_GAMES ?? 200);
const MAX_STEPS = 400;

function checkInvariants(s: GameState, totalWhite: number, label: string) {
  // 1. Nenhuma carta some ou duplica (enquanto a partida roda).
  if (s.phase !== "lobby") {
    const ids = allWhiteIds(s);
    expect(new Set(ids).size, `${label}: carta duplicada`).toBe(ids.length);
    expect(ids.length, `${label}: cartas perdidas`).toBe(totalWhite);
  }
  // 2. Mãos nunca passam do limite.
  for (const pl of Object.values(s.players)) {
    expect(pl.hand.length, `${label}: mão grande demais`).toBeLessThanOrEqual(s.settings.handSize);
    if (pl.status !== "active") expect(pl.hand, `${label}: quem saiu ficou com cartas`).toEqual([]);
  }
  // 3. Pontos = rodadas com vencedor.
  const points = Object.values(s.players).reduce((a, x) => a + x.score, 0);
  expect(points, `${label}: pontos não batem`).toBe(s.roundsPlayed);
  // 4. Coerência da rodada.
  const r = s.round;
  if (s.phase === "submitting" || s.phase === "judging" || s.phase === "round_result") {
    expect(r, `${label}: fase de jogo sem rodada`).not.toBeNull();
    expect(r!.participants, `${label}: juiz participando`).not.toContain(r!.judgeId);
    expect(r!.submissions[r!.judgeId], `${label}: juiz respondeu`).toBeUndefined();
    for (const [id, sub] of Object.entries(r!.submissions)) {
      expect(sub.cards.length, `${label}: quantidade de cartas`).toBe(r!.blackCard.pick);
      expect(r!.participants, `${label}: resposta de quem não participa`).toContain(id);
    }
  }
  if (s.phase === "judging") {
    expect(r!.revealOrder.length).toBeGreaterThanOrEqual(2);
    expect(r!.revealed).toBeLessThanOrEqual(r!.revealOrder.length);
  }
  if (s.phase === "lobby" || s.phase === "paused" || s.phase === "game_over") {
    expect(r, `${label}: rodada sobrando em ${s.phase}`).toBeNull();
  }
  // 5. Anfitrião é sempre um jogador conhecido.
  expect(s.players[s.hostId], `${label}: anfitrião inexistente`).toBeDefined();
  // 6. Placar nunca passa do necessário para vencer.
  for (const pl of Object.values(s.players)) expect(pl.score).toBeLessThanOrEqual(s.settings.pointsToWin);
}

function randomAction(s: GameState, rng: Rng, ids: string[]): { action: GameAction; actor: Actor; advance: number } {
  const actorId = ids[rng.int(ids.length)]!;
  const actor: Actor = { type: "player", id: actorId };
  const me = s.players[actorId];
  const r = s.round;
  const roll = rng.next();
  const advance = rng.next() < 0.15 ? rng.int(70_000) : rng.int(3_000);

  if (roll < 0.04) return { action: { type: "SET_CONNECTION", playerId: actorId, connected: rng.next() < 0.5 }, actor: { type: "system" }, advance };
  if (roll < 0.05) return { action: { type: "LEAVE" }, actor, advance };
  if (roll < 0.07) return { action: { type: "JOIN", nickname: `Jog ${actorId}`, acceptedLevel4: true }, actor, advance };
  if (roll < 0.08) return { action: { type: "KICK", playerId: ids[rng.int(ids.length)]! }, actor, advance };
  if (roll < 0.09) return { action: { type: "TRANSFER_HOST", playerId: ids[rng.int(ids.length)]! }, actor, advance };
  if (roll < 0.12) return { action: { type: "TICK" }, actor, advance };
  if (roll < 0.13) return { action: { type: "PLAY_AGAIN" }, actor, advance };
  if (roll < 0.15) return { action: { type: "START_GAME" }, actor, advance };
  if (roll < 0.17) return { action: { type: "NEXT_ROUND" }, actor, advance };
  if (roll < 0.19) {
    // carta de outra pessoa ou repetida: tentativa de trapaça
    const other = s.players[ids[rng.int(ids.length)]!];
    const id = other?.hand[0]?.id ?? "inexistente";
    return { action: { type: "SUBMIT", cardIds: [id, id] }, actor, advance };
  }
  if (roll < 0.6 && me && r && s.phase === "submitting") {
    const pick = r.blackCard.pick;
    const cards = rng.shuffle(me.hand).slice(0, pick).map((c) => c.id);
    return { action: { type: "SUBMIT", cardIds: cards }, actor: { type: "player", id: rng.next() < 0.7 && r.participants.length ? r.participants[rng.int(r.participants.length)]! : actorId }, advance: rng.int(2000) };
  }
  if (r && s.phase === "judging") {
    const judge: Actor = { type: "player", id: rng.next() < 0.85 ? r.judgeId : actorId };
    if (r.revealed < r.revealOrder.length && rng.next() < 0.8) return { action: { type: "REVEAL_NEXT" }, actor: judge, advance: rng.int(2000) };
    return { action: { type: "PICK_WINNER", answerIndex: rng.int(r.revealOrder.length + 1) }, actor: judge, advance: rng.int(2000) };
  }
  return { action: { type: "TICK" }, actor, advance: rng.int(10_000) };
}

describe("motor: simulação de partidas aleatórias", () => {
  it(`${GAMES} partidas sem estado inválido e sem vazamento`, () => {
    const meta = new Rng(2026);
    let finished = 0;
    let steps = 0;
    for (let g = 0; g < GAMES; g++) {
      const n = LIMITS.players.min + meta.int(6);
      const settings = {
        pointsToWin: 3 + meta.int(4),
        handSize: 5 + meta.int(6),
        answerSeconds: [0, 45, 60, 90][meta.int(4)] as 0 | 45 | 60 | 90,
        maxPlayers: 10,
        maxRounds: meta.next() < 0.3 ? 5 + meta.int(5) : null,
      };
      const pool = makePool(15 + meta.int(20), 120 + meta.int(80), { pick2Every: meta.next() < 0.5 ? 3 : undefined });
      let now = T0;
      let s = lobby(n, settings, meta.int(2 ** 31));
      const ids = [...Object.keys(s.players), "extra1", "extra2"];
      const totalWhite = pool.white.length;
      const rng = new Rng(meta.int(2 ** 31));

      for (let step = 0; step < MAX_STEPS; step++) {
        const { action, actor, advance } = randomAction(s, rng, ids);
        now += advance;
        const res = applyAction(s, action, actor, { now, cards: pool });
        steps++;
        if (!res.ok) continue;
        s = res.state;
        const label = `jogo ${g}, passo ${step} (${action.type})`;
        checkInvariants(s, totalWhite, label);
        if (step % 5 === 0 || s.phase === "judging") for (const id of ids) assertNoLeak(s, id, now);
        if (s.phase === "game_over") {
          finished++;
          break;
        }
      }
    }
    // Com tanto caos (quedas, saídas, trapaças) poucas chegam ao fim em 400 passos;
    // o término é garantido no teste "bem-comportadas" abaixo.
    expect(finished).toBeGreaterThan(0);
    expect(steps).toBeGreaterThan(GAMES * 20);
  }, 600_000);

  it("partidas bem-comportadas sempre terminam", () => {
    const meta = new Rng(7);
    for (let g = 0; g < 120; g++) {
      const pool = makePool(20, 150, { pick2Every: 4 });
      let s = lobby(3 + meta.int(8), { pointsToWin: 3 + meta.int(8), maxPlayers: 10 }, g);
      let now = T0;
      s = (applyAction(s, { type: "START_GAME" }, { type: "player", id: "p0" }, { now, cards: pool }) as { state: GameState }).state;
      let guard = 0;
      while (s.phase !== "game_over" && guard++ < 20_000) {
        now += 1000;
        const r = s.round!;
        let action: GameAction = { type: "TICK" };
        let actor: Actor = { type: "player", id: s.hostId };
        if (s.phase === "submitting") {
          const next = r.participants.find((id) => !r.submissions[id]);
          if (next) {
            action = { type: "SUBMIT", cardIds: s.players[next]!.hand.slice(0, r.blackCard.pick).map((c) => c.id) };
            actor = { type: "player", id: next };
          }
        } else if (s.phase === "judging") {
          actor = { type: "player", id: r.judgeId };
          action = r.revealed < r.revealOrder.length ? { type: "REVEAL_NEXT" } : { type: "PICK_WINNER", answerIndex: meta.int(r.revealOrder.length) };
        } else if (s.phase === "round_result") {
          action = { type: "NEXT_ROUND" };
        }
        const res = applyAction(s, action, actor, { now });
        if (!res.ok) throw new Error(`jogo ${g}: ${action.type} falhou com ${res.error.code}`);
        s = res.state;
      }
      expect(s.phase, `jogo ${g} não terminou`).toBe("game_over");
      expect(s.winners.length).toBeGreaterThanOrEqual(1);
    }
  }, 600_000);
});

describe("motor: código determinístico", () => {
  it("não usa relógio nem sorteio do sistema", () => {
    const dir = path.resolve(import.meta.dirname, "../../../src/engine");
    for (const file of readdirSync(dir)) {
      const code = readFileSync(path.join(dir, file), "utf8");
      expect(code, file).not.toMatch(/Date\.now|new Date\(|Math\.random|performance\.now/);
    }
  });
});

describe("motor: semente", () => {
  it("gera a semente a partir de bytes do servidor", async () => {
    const { seedFromBytes } = await import("@/engine");
    expect(seedFromBytes(Uint8Array.from([0, 0, 1, 0]))).toBe(256);
    expect(seedFromBytes(Uint8Array.from([255, 255, 255, 255, 9]))).toBe(4294967295);
  });
});
