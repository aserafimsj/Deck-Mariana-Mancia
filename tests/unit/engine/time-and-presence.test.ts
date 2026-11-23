import { describe, expect, it } from "vitest";
import { DISCONNECT_GRACE_MS, HOST_GRACE_MS, MIN_JUDGING_MS, RESULT_MS } from "@/engine";
import { allWhiteIds, everyoneSubmits, fails, judgePicks, lobby, ok, p, started, SYSTEM, T0 } from "./helpers";

const off = (id: string) => ({ type: "SET_CONNECTION" as const, playerId: id, connected: false });
const on = (id: string) => ({ type: "SET_CONNECTION" as const, playerId: id, connected: true });

describe("motor: tempo", () => {
  it("o prazo só é aplicado pelo servidor, com a hora do servidor", () => {
    const s = started(4);
    expect(ok(s, { type: "TICK" }, p("p1"), T0 + 59_999).phase).toBe("submitting");
  });

  it("tempo esgotado com 2+ respostas: vai para o julgamento sem quem não respondeu", () => {
    let s = started(4);
    const [a, b] = s.round!.participants;
    s = ok(s, { type: "SUBMIT", cardIds: [s.players[a!]!.hand[0]!.id] }, p(a!));
    s = ok(s, { type: "SUBMIT", cardIds: [s.players[b!]!.hand[0]!.id] }, p(b!));
    s = ok(s, { type: "TICK" }, p("p0"), T0 + 60_000);
    expect(s.phase).toBe("judging");
    expect(s.round!.revealOrder).toHaveLength(2);
    expect(s.round!.deadline).toBe(T0 + 60_000 + MIN_JUDGING_MS);
  });

  it("tempo esgotado com menos de 2 respostas: rodada anulada, cartas devolvidas, novo juiz", () => {
    let s = started(4);
    const firstJudge = s.round!.judgeId;
    const a = s.round!.participants[0]!;
    const card = s.players[a]!.hand[0]!;
    s = ok(s, { type: "SUBMIT", cardIds: [card.id] }, p(a));
    s = ok(s, { type: "TICK" }, p("p0"), T0 + 60_000);
    expect(s.phase).toBe("submitting");
    expect(s.round!.number).toBe(2);
    expect(s.round!.judgeId).not.toBe(firstJudge);
    expect(s.players[a]!.hand.map((c) => c.id)).toContain(card.id);
    expect(s.history[0]!.endReason).toBe("timeout");
  });

  it("juiz que não escolhe a tempo: o sistema sorteia a vencedora", () => {
    let s = everyoneSubmits(started(4));
    s = ok(s, { type: "TICK" }, p("p1"), T0 + MIN_JUDGING_MS);
    expect(s.phase).toBe("round_result");
    expect(s.history.at(-1)!.endReason).toBe("timeout");
    expect(Object.values(s.players).reduce((a, x) => a + x.score, 0)).toBe(1);
  });

  it("sem temporizador, ninguém é apressado", () => {
    let s = started(4, { answerSeconds: 0 });
    expect(s.round!.deadline).toBeNull();
    s = ok(s, { type: "TICK" }, p("p1"), T0 + 86_400_000);
    expect(s.phase).toBe("submitting");
    s = everyoneSubmits(s);
    expect(s.round!.deadline).toBeNull();
  });

  it("uma rodada anulada no meio ainda numera certo a seguinte", () => {
    let s = started(4);
    s = ok(s, { type: "TICK" }, p("p0"), T0 + 60_000); // ninguém respondeu
    expect(s.round!.number).toBe(2);
    s = judgePicks(everyoneSubmits(s, T0 + 60_000), 0, T0 + 60_000);
    s = ok(s, { type: "TICK" }, p("p0"), T0 + 60_000 + RESULT_MS);
    expect(s.round!.number).toBe(3);
  });
});

describe("motor: conexão e saída", () => {
  it("só o servidor informa conexão", () => {
    fails(started(4), off("p1"), p("p1"), "SYSTEM_ONLY");
  });

  it("queda rápida não atrapalha: a vaga fica guardada", () => {
    let s = started(4);
    const a = s.round!.participants[0]!;
    s = ok(s, off(a), SYSTEM, T0 + 1000);
    s = ok(s, { type: "TICK" }, p("p0"), T0 + DISCONNECT_GRACE_MS);
    expect(s.phase).toBe("submitting");
    s = ok(s, on(a), SYSTEM, T0 + 30_000);
    expect(s.players[a]!.connected).toBe(true);
  });

  it("quem ficou ausente além do prazo deixa de ser esperado", () => {
    let s = started(5, { answerSeconds: 0 });
    const [absent, ...rest] = s.round!.participants;
    s = ok(s, off(absent!), SYSTEM, T0);
    for (const id of rest) s = ok(s, { type: "SUBMIT", cardIds: [s.players[id]!.hand[0]!.id] }, p(id), T0 + 1000);
    expect(s.phase).toBe("submitting"); // ainda dentro do prazo de tolerância
    s = ok(s, { type: "TICK" }, p("p0"), T0 + DISCONNECT_GRACE_MS);
    expect(s.phase).toBe("judging");
    expect(s.round!.revealOrder).not.toContain(absent);
  });

  it("juiz ausente: rodada anulada e o próximo assume", () => {
    let s = started(4);
    const judge = s.round!.judgeId;
    const a = s.round!.participants[0]!;
    const card = s.players[a]!.hand[0]!;
    s = ok(s, { type: "SUBMIT", cardIds: [card.id] }, p(a));
    s = ok(s, off(judge), SYSTEM, T0);
    s = ok(s, { type: "TICK" }, p(a), T0 + DISCONNECT_GRACE_MS);
    expect(s.round!.judgeId).not.toBe(judge);
    expect(s.history[0]!.endReason).toBe("judge_left");
    expect(s.players[a]!.hand.map((c) => c.id)).toContain(card.id);
  });

  it("juiz que sai durante o julgamento: rodada anulada", () => {
    let s = everyoneSubmits(started(5));
    const judge = s.round!.judgeId;
    s = ok(s, { type: "LEAVE" }, p(judge));
    expect(s.phase).toBe("submitting");
    expect(s.history[0]!.endReason).toBe("judge_left");
  });

  it("quem sai durante as respostas tem a resposta descartada e a mão devolvida ao baralho", () => {
    let s = started(5);
    const before = allWhiteIds(s).sort();
    const a = s.round!.participants[0]!;
    s = ok(s, { type: "SUBMIT", cardIds: [s.players[a]!.hand[0]!.id] }, p(a));
    s = ok(s, { type: "LEAVE" }, p(a));
    expect(s.round!.submissions[a]).toBeUndefined();
    expect(s.players[a]!.hand).toEqual([]);
    expect(allWhiteIds(s).sort()).toEqual(before);
  });

  it("menos de 3 presentes: pausa; quando volta alguém, retoma sozinho", () => {
    let s = started(3);
    s = ok(s, { type: "LEAVE" }, p("p2"));
    expect(s.phase).toBe("paused");
    expect(s.pausedReason).toBe("not_enough_players");
    fails(s, { type: "SUBMIT", cardIds: ["w1"] }, p("p1"), "WRONG_PHASE");
    s = ok(s, { type: "JOIN", nickname: "Novo" }, p("n"));
    expect(s.phase).toBe("submitting");
    expect(s.players.n!.hand).toHaveLength(7);
  });

  it("quem entra no meio da rodada recebe cartas e joga a partir da próxima", () => {
    let s = started(3, { maxPlayers: 4 });
    s = ok(s, { type: "JOIN", nickname: "Atrasado" }, p("late"));
    expect(s.players.late!.hand).toHaveLength(7);
    fails(s, { type: "SUBMIT", cardIds: [s.players.late!.hand[0]!.id] }, p("late"), "NOT_PARTICIPANT");
    s = everyoneSubmits(s);
    expect(s.phase).toBe("judging");
    s = ok(judgePicks(s), { type: "NEXT_ROUND" }, p("p0"));
    expect(s.round!.participants.includes("late") || s.round!.judgeId === "late").toBe(true);
  });
});

describe("motor: anfitrião", () => {
  it("anfitrião que sai passa a função para o jogador mais antigo", () => {
    const s = ok(lobby(3), { type: "LEAVE" }, p("p0"));
    expect(s.hostId).toBe("p1");
  });

  it("anfitrião desconectado por mais de 30 s perde a função", () => {
    let s = ok(lobby(3), off("p0"), SYSTEM, T0);
    s = ok(s, { type: "TICK" }, p("p1"), T0 + HOST_GRACE_MS - 1);
    expect(s.hostId).toBe("p0");
    s = ok(s, { type: "TICK" }, p("p1"), T0 + HOST_GRACE_MS);
    expect(s.hostId).toBe("p1");
  });

  it("pode passar a função manualmente", () => {
    const s = ok(lobby(3), { type: "TRANSFER_HOST", playerId: "p2" }, p("p0"));
    expect(s.hostId).toBe("p2");
    fails(s, { type: "START_GAME" }, p("p0"), "NOT_HOST");
  });

  it("anfitrião removido não pode mais agir", () => {
    let s = ok(lobby(4), { type: "TRANSFER_HOST", playerId: "p1" }, p("p0"));
    s = ok(s, { type: "KICK", playerId: "p0" }, p("p1"));
    fails(s, { type: "LEAVE" }, p("p0"), "KICKED");
  });
});
