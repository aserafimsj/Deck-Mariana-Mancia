import { describe, expect, it } from "vitest";
import { applyAction, createGameState, RESULT_MS } from "@/engine";
import { everyoneSubmits, fails, judgePicks, lobby, makePool, ok, p, started, T0 } from "./helpers";

describe("motor: sala de espera", () => {
  it("cria a sala com o anfitrião como primeiro jogador", () => {
    const s = createGameState({ hostId: "h", hostNickname: "  Ana  ", seed: 1, now: T0 });
    expect(s.phase).toBe("lobby");
    expect(s.hostId).toBe("h");
    expect(s.players.h).toMatchObject({ nickname: "Ana", seat: 0, status: "active", connected: true });
  });

  it("recusa apelido inválido, repetido (sem diferenciar maiúsculas) e sala cheia", () => {
    let s = lobby(2, { maxPlayers: 3 });
    fails(s, { type: "JOIN", nickname: "A" }, p("x"), "INVALID_NICKNAME");
    fails(s, { type: "JOIN", nickname: "JOGADOR 1" }, p("x"), "NICKNAME_TAKEN");
    s = ok(s, { type: "JOIN", nickname: "Cris" }, p("p2"));
    fails(s, { type: "JOIN", nickname: "Duda" }, p("p3"), "ROOM_FULL");
  });

  it("entrar de novo com o mesmo usuário é reconexão, não duplicação", () => {
    let s = lobby(3);
    s = ok(s, { type: "SET_CONNECTION", playerId: "p1", connected: false }, { type: "system" });
    s = ok(s, { type: "JOIN", nickname: "Jogador 1" }, p("p1"));
    expect(Object.keys(s.players)).toHaveLength(3);
    expect(s.players.p1).toMatchObject({ connected: true, disconnectedAt: null, seat: 1 });
  });

  it("só o anfitrião muda regras, inicia, remove ou passa a função", () => {
    const s = lobby(3);
    fails(s, { type: "UPDATE_SETTINGS", settings: { pointsToWin: 5 } }, p("p1"), "NOT_HOST");
    fails(s, { type: "START_GAME" }, p("p1"), "NOT_HOST", T0, makePool());
    fails(s, { type: "KICK", playerId: "p2" }, p("p1"), "NOT_HOST");
    fails(s, { type: "TRANSFER_HOST", playerId: "p2" }, p("p1"), "NOT_HOST");
  });

  it("valida as regras alteradas", () => {
    const s = lobby(4);
    fails(s, { type: "UPDATE_SETTINGS", settings: { pointsToWin: 99 } }, p("p0"), "INVALID_SETTINGS");
    fails(s, { type: "UPDATE_SETTINGS", settings: { maxPlayers: 3 } }, p("p0"), "INVALID_SETTINGS");
    const s2 = ok(s, { type: "UPDATE_SETTINGS", settings: { pointsToWin: 3, answerSeconds: 0 } }, p("p0"));
    expect(s2.settings).toMatchObject({ pointsToWin: 3, answerSeconds: 0, handSize: 7 });
  });

  it("não inicia com menos de 3 jogadores", () => {
    fails(lobby(2), { type: "START_GAME" }, p("p0"), "NOT_ENOUGH_PLAYERS", T0, makePool());
  });

  it("não inicia sem cartas suficientes", () => {
    fails(lobby(3), { type: "START_GAME" }, p("p0"), "NOT_ENOUGH_CARDS", T0, makePool(5, 10));
    fails(lobby(3), { type: "START_GAME" }, p("p0"), "NOT_ENOUGH_CARDS", T0, undefined);
  });

  it("jogador removido não volta; quem saiu pode voltar", () => {
    let s = lobby(4);
    s = ok(s, { type: "KICK", playerId: "p3" }, p("p0"));
    fails(s, { type: "JOIN", nickname: "Outro nome" }, p("p3"), "KICKED");
    s = ok(s, { type: "LEAVE" }, p("p2"));
    s = ok(s, { type: "JOIN", nickname: "Jogador 2" }, p("p2"));
    expect(s.players.p2!.status).toBe("active");
    fails(s, { type: "KICK", playerId: "p0" }, p("p0"), "INVALID_TARGET");
  });
});

describe("motor: rodada completa", () => {
  it("inicia: distribui mãos, escolhe juiz e carta pergunta", () => {
    const s = started(4);
    expect(s.phase).toBe("submitting");
    for (const pl of Object.values(s.players)) expect(pl.hand).toHaveLength(7);
    const r = s.round!;
    expect(r.number).toBe(1);
    expect(Object.keys(s.players)).toContain(r.judgeId);
    expect(r.participants).toHaveLength(3);
    expect(r.participants).not.toContain(r.judgeId);
    expect(r.deadline).toBe(T0 + 60_000);
  });

  it("juiz não responde; resposta só uma vez; só cartas da própria mão", () => {
    const s = started(4);
    const r = s.round!;
    const judge = s.players[r.judgeId]!;
    const player = s.players[r.participants[0]!]!;
    const other = s.players[r.participants[1]!]!;
    fails(s, { type: "SUBMIT", cardIds: [judge.hand[0]!.id] }, p(judge.id), "JUDGE_CANNOT_ANSWER");
    fails(s, { type: "SUBMIT", cardIds: [other.hand[0]!.id] }, p(player.id), "INVALID_CARDS");
    fails(s, { type: "SUBMIT", cardIds: [] }, p(player.id), "INVALID_CARDS");
    fails(s, { type: "SUBMIT", cardIds: [player.hand[0]!.id, player.hand[1]!.id] }, p(player.id), "INVALID_CARDS");
    const s2 = ok(s, { type: "SUBMIT", cardIds: [player.hand[0]!.id] }, p(player.id));
    expect(s2.players[player.id]!.hand).toHaveLength(6);
    fails(s2, { type: "SUBMIT", cardIds: [s2.players[player.id]!.hand[0]!.id] }, p(player.id), "ALREADY_SUBMITTED");
  });

  it("quando todos respondem, vai para o julgamento com respostas embaralhadas", () => {
    const s = everyoneSubmits(started(4));
    expect(s.phase).toBe("judging");
    expect(s.round!.revealOrder.sort()).toEqual([...s.round!.participants].sort());
    expect(s.round!.revealed).toBe(0);
  });

  it("juiz revela todas antes de escolher; só o juiz escolhe", () => {
    let s = everyoneSubmits(started(4));
    const judge = s.round!.judgeId;
    const notJudge = s.round!.participants[0]!;
    fails(s, { type: "PICK_WINNER", answerIndex: 0 }, p(judge), "NOT_ALL_REVEALED");
    fails(s, { type: "REVEAL_NEXT" }, p(notJudge), "NOT_JUDGE");
    for (let i = 0; i < 3; i++) s = ok(s, { type: "REVEAL_NEXT" }, p(judge));
    fails(s, { type: "PICK_WINNER", answerIndex: 0 }, p(notJudge), "NOT_JUDGE");
    fails(s, { type: "PICK_WINNER", answerIndex: 3 }, p(judge), "INVALID_ANSWER");
    fails(s, { type: "PICK_WINNER", answerIndex: 1.5 }, p(judge), "INVALID_ANSWER");
  });

  it("vencedor ganha 1 ponto; a escolha não pode ser repetida", () => {
    let s = everyoneSubmits(started(4));
    const winner = s.round!.revealOrder[2]!;
    s = judgePicks(s, 2);
    expect(s.phase).toBe("round_result");
    expect(s.players[winner]).toMatchObject({ score: 1, roundsWon: 1 });
    expect(Object.values(s.players).reduce((a, x) => a + x.score, 0)).toBe(1);
    fails(s, { type: "PICK_WINNER", answerIndex: 0 }, p(s.round!.judgeId), "WRONG_PHASE");
    expect(s.history).toHaveLength(1);
    expect(s.history[0]).toMatchObject({ winnerId: winner, endReason: "judged" });
  });

  it("próxima rodada: mãos repostas e juiz seguinte no rodízio", () => {
    let s = judgePicks(everyoneSubmits(started(4)));
    const firstJudge = s.round!.judgeId;
    s = ok(s, { type: "TICK" }, p("p1"), T0 + RESULT_MS);
    expect(s.phase).toBe("submitting");
    expect(s.round!.number).toBe(2);
    const seats = Object.values(s.players).sort((a, b) => a.seat - b.seat).map((x) => x.id);
    expect(s.round!.judgeId).toBe(seats[(seats.indexOf(firstJudge) + 1) % seats.length]);
    for (const pl of Object.values(s.players)) expect(pl.hand).toHaveLength(7);
  });

  it("o resultado fica na tela até o tempo acabar (ou o anfitrião avançar)", () => {
    const s = judgePicks(everyoneSubmits(started(4)));
    expect(ok(s, { type: "TICK" }, p("p1"), T0 + RESULT_MS - 1).phase).toBe("round_result");
    fails(s, { type: "NEXT_ROUND" }, p("p1"), "NOT_HOST");
    expect(ok(s, { type: "NEXT_ROUND" }, p("p0")).phase).toBe("submitting");
  });

  it("todos são juiz uma vez antes de alguém repetir", () => {
    let s = started(5, { pointsToWin: 15 });
    const judges: string[] = [];
    for (let i = 0; i < 5; i++) {
      judges.push(s.round!.judgeId);
      s = ok(judgePicks(everyoneSubmits(s)), { type: "NEXT_ROUND" }, p(s.hostId));
    }
    expect(new Set(judges).size).toBe(5);
  });

  it("carta de 2 lacunas exige 2 cartas, na ordem escolhida", () => {
    let s = started(3, {}, 7, makePool(10, 100, { pick2Every: 1 }));
    expect(s.round!.blackCard.pick).toBe(2);
    const id = s.round!.participants[0]!;
    const hand = s.players[id]!.hand;
    fails(s, { type: "SUBMIT", cardIds: [hand[0]!.id] }, p(id), "INVALID_CARDS");
    fails(s, { type: "SUBMIT", cardIds: [hand[0]!.id, hand[0]!.id] }, p(id), "INVALID_CARDS");
    s = ok(s, { type: "SUBMIT", cardIds: [hand[1]!.id, hand[0]!.id] }, p(id));
    expect(s.round!.submissions[id]!.cards.map((c) => c.id)).toEqual([hand[1]!.id, hand[0]!.id]);
  });
});

describe("motor: fim de partida", () => {
  function playUntilOver(s: ReturnType<typeof started>) {
    for (let i = 0; i < 200 && s.phase !== "game_over"; i++) {
      s = ok(judgePicks(everyoneSubmits(s)), { type: "NEXT_ROUND" }, p(s.hostId));
    }
    return s;
  }

  it("termina quando alguém atinge os pontos", () => {
    const s = playUntilOver(started(3, { pointsToWin: 3 }));
    expect(s.phase).toBe("game_over");
    const top = Math.max(...Object.values(s.players).map((x) => x.score));
    expect(top).toBe(3);
    expect(s.winners).toHaveLength(1);
    expect(s.players[s.winners[0]!]!.score).toBe(3);
  });

  it("termina pelo limite de rodadas, com empate possível", () => {
    const s = playUntilOver(started(5, { pointsToWin: 15, maxRounds: 5 }));
    expect(s.phase).toBe("game_over");
    expect(s.roundsPlayed).toBe(5);
    const top = Math.max(...Object.values(s.players).map((x) => x.score));
    for (const w of s.winners) expect(s.players[w]!.score).toBe(top);
  });

  it("jogar novamente volta à sala de espera com placar zerado", () => {
    let s = playUntilOver(started(3, { pointsToWin: 3 }));
    fails(s, { type: "PLAY_AGAIN" }, p("p1"), "NOT_HOST");
    s = ok(s, { type: "PLAY_AGAIN" }, p(s.hostId));
    expect(s.phase).toBe("lobby");
    for (const pl of Object.values(s.players)) expect(pl).toMatchObject({ score: 0, roundsWon: 0, hand: [] });
    s = ok(s, { type: "START_GAME" }, p(s.hostId), T0, makePool());
    expect(s.phase).toBe("submitting");
    expect(s.round!.number).toBe(1);
  });
});

describe("motor: nível Sem Filtro", () => {
  it("todos precisam aceitar o aviso antes de começar", () => {
    let s = lobby(3);
    s = ok(s, { type: "JOIN", nickname: "Sem Aviso" }, p("late"));
    s = ok(s, { type: "UPDATE_SETTINGS", settings: { humorLevel: 4 } }, p("p0"));
    fails(s, { type: "START_GAME" }, p("p0"), "LEVEL4_NOT_ACCEPTED", T0, makePool(30, 200, { level: 4 }));
    s = ok(s, { type: "ACCEPT_LEVEL4" }, p("late"));
    for (const id of ["p1", "p2"]) s = ok(s, { type: "ACCEPT_LEVEL4" }, p(id));
    expect(ok(s, { type: "START_GAME" }, p("p0"), T0, makePool(30, 200, { level: 4 })).phase).toBe("submitting");
  });

  it("quem entra numa sala Sem Filtro precisa ter aceitado", () => {
    const s = lobby(3, { humorLevel: 4 });
    fails(s, { type: "JOIN", nickname: "Novato" }, p("n"), "LEVEL4_NOT_ACCEPTED");
    ok(s, { type: "JOIN", nickname: "Novato", acceptedLevel4: true }, p("n"));
  });

  it("nunca usa carta acima do nível da sala, mesmo se o servidor mandar", () => {
    const pool = makePool(10, 100, { level: 1 });
    pool.white.push(...Array.from({ length: 50 }, (_, i) => ({ id: `pesada${i}`, text: "x", humorLevel: 3 as const })));
    pool.black.push({ id: "bpesada", text: "x ___", pick: 1, humorLevel: 3 });
    const s = started(3, { humorLevel: 2 }, 3, pool);
    const all = [...s.deck.white, ...Object.values(s.players).flatMap((x) => x.hand)].map((c) => c.id);
    expect(all.some((id) => id.startsWith("pesada"))).toBe(false);
    expect([...s.deck.black, s.round!.blackCard].some((c) => c.id === "bpesada")).toBe(false);
  });
});

describe("motor: pureza", () => {
  it("não altera o estado recebido", () => {
    const s = started(4);
    const snapshot = JSON.stringify(s);
    applyAction(s, { type: "SUBMIT", cardIds: [s.players[s.round!.participants[0]!]!.hand[0]!.id] }, p(s.round!.participants[0]!), { now: T0 });
    expect(JSON.stringify(s)).toBe(snapshot);
  });

  it("mesma semente e mesmas ações produzem o mesmo jogo", () => {
    const a = judgePicks(everyoneSubmits(started(5, {}, 123)));
    const b = judgePicks(everyoneSubmits(started(5, {}, 123)));
    const c = judgePicks(everyoneSubmits(started(5, {}, 124)));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(c));
  });

  it("TICK sem nada para fazer não muda o estado", () => {
    const r = applyAction(started(4), { type: "TICK" }, p("p1"), { now: T0 + 1000 });
    expect(r.ok && r.changed).toBe(false);
  });
});
