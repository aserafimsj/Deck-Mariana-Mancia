import { describe, expect, it } from "vitest";
import { projectFor, RESULT_MS } from "@/engine";
import { assertNoLeak, everyoneSubmits, judgePicks, lobby, ok, p, started, T0 } from "./helpers";

describe("projeção: o que cada jogador vê", () => {
  it("na sala de espera: lista de jogadores e anfitrião, nenhuma carta", () => {
    const v = projectFor(lobby(3), "p1", T0);
    expect(v.phase).toBe("lobby");
    expect(v.players.map((x) => x.nickname)).toEqual(["Jogador 0", "Jogador 1", "Jogador 2"]);
    expect(v.you).toMatchObject({ id: "p1", isHost: false, hand: [] });
    expect(v.round).toBeNull();
  });

  it("respondendo: vê a própria mão e quem já respondeu, nunca o quê", () => {
    let s = started(4);
    const [a, b] = s.round!.participants as [string, string];
    s = ok(s, { type: "SUBMIT", cardIds: [s.players[a]!.hand[0]!.id] }, p(a));
    const vb = projectFor(s, b, T0);
    expect(vb.you!.hand).toEqual(s.players[b]!.hand);
    expect(vb.players.find((x) => x.id === a)!.hasSubmitted).toBe(true);
    expect(vb.round).toMatchObject({ submittedCount: 1, requiredCount: 3, answers: [] });
    const va = projectFor(s, a, T0);
    expect(va.you!.submission).toEqual(s.round!.submissions[a]!.cards);
    for (const id of Object.keys(s.players)) assertNoLeak(s, id);
  });

  it("julgamento: respostas sem autor, aparecendo uma a uma", () => {
    let s = everyoneSubmits(started(4));
    for (const id of Object.keys(s.players)) assertNoLeak(s, id);
    let v = projectFor(s, "p1", T0);
    expect(v.round!.answers.map((a) => a.cards)).toEqual([null, null, null]);
    s = ok(s, { type: "REVEAL_NEXT" }, p(s.round!.judgeId));
    v = projectFor(s, "p1", T0);
    expect(v.round!.answers[0]!.cards).not.toBeNull();
    expect(v.round!.answers[1]!.cards).toBeNull();
    for (const id of Object.keys(s.players)) assertNoLeak(s, id);
  });

  it("resultado: autor e vencedora revelados para todos", () => {
    const s = judgePicks(everyoneSubmits(started(4)), 1);
    const v = projectFor(s, "p2", T0);
    expect(v.round!.winnerId).toBe(s.round!.revealOrder[1]);
    expect(v.round!.answers.every((a) => a.playerId !== null && a.cards !== null)).toBe(true);
    expect(v.round!.answers.filter((a) => a.winner)).toHaveLength(1);
    expect(v.round!.nextRoundAt).toBe(T0 + RESULT_MS);
  });

  it("fim de partida: ranking com empates e estatísticas", () => {
    let s = started(3, { pointsToWin: 3 });
    for (let i = 0; i < 100 && s.phase !== "game_over"; i++) s = ok(judgePicks(everyoneSubmits(s, T0 + i * 1000)), { type: "NEXT_ROUND" }, p(s.hostId), T0 + i * 1000 + 500);
    const v = projectFor(s, "p0", T0);
    expect(v.result!.winners).toEqual(s.winners);
    expect(v.result!.ranking[0]!.rank).toBe(1);
    expect(v.result!.ranking[0]!.score).toBe(3);
    expect(v.result!.stats.rounds).toBe(s.roundsPlayed);
    expect(v.result!.stats.winningCards).toHaveLength(s.roundsPlayed);
    expect(v.result!.stats.fastest).not.toBeNull();
    expect(v.result!.stats.durationMs).toBeGreaterThan(0);
  });

  it("quem não está na sala (ou foi removido) não recebe dados pessoais", () => {
    let s = started(4);
    expect(projectFor(s, "estranho", T0).you).toBeNull();
    s = ok(s, { type: "KICK", playerId: "p3" }, p("p0"));
    expect(projectFor(s, "p3", T0).you).toBeNull();
    assertNoLeak(s, "p3");
  });

  it("avisa quem precisa aceitar o Sem Filtro e quem espera a próxima rodada", () => {
    let s = lobby(3);
    s = ok(s, { type: "JOIN", nickname: "Sem Aviso" }, p("novo"));
    s = ok(s, { type: "UPDATE_SETTINGS", settings: { humorLevel: 4 } }, p("p0"));
    expect(projectFor(s, "novo", T0).you!.needsLevel4Accept).toBe(true);
    expect(projectFor(s, "p0", T0).you!.needsLevel4Accept).toBe(false);

    let g = started(3, { maxPlayers: 5 });
    g = ok(g, { type: "JOIN", nickname: "Atrasado" }, p("late"));
    expect(projectFor(g, "late", T0).you!.waitingNextRound).toBe(true);
  });
});
