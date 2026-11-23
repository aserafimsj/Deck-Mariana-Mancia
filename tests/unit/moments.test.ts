import { describe, expect, it } from "vitest";
import { projectFor, RESULT_MS } from "@/engine";
import { describeMoment, detectMoments } from "@/lib/moments";
import { everyoneSubmits, judgePicks, lobby, makePool, ok, p, started, T0 } from "./engine/helpers";

const view = (s: Parameters<typeof projectFor>[0], id: string) => projectFor(s, id, T0);

describe("momentos da partida (o que dispara som, vibração e avisos)", () => {
  it("nada na primeira carga", () => {
    expect(detectMoments(null, view(lobby(3), "p1"))).toEqual([]);
  });

  it("entrada e saída de jogadores", () => {
    const a = lobby(3);
    const b = ok(a, { type: "JOIN", nickname: "Duda" }, p("p3"));
    expect(detectMoments(view(a, "p0"), view(b, "p0"))).toEqual([{ type: "player_joined", nickname: "Duda" }]);
    const c = ok(b, { type: "LEAVE" }, p("p3"));
    expect(detectMoments(view(b, "p0"), view(c, "p0"))).toEqual([{ type: "player_left", nickname: "Duda" }]);
  });

  it("início da partida avisa quem é o juiz", () => {
    const a = lobby(3);
    const b = ok(a, { type: "START_GAME" }, p("p0"), T0, makePool());
    const judge = b.round!.judgeId;
    const forJudge = detectMoments(view(a, judge), view(b, judge));
    expect(forJudge).toContainEqual({ type: "game_started" });
    expect(forJudge).toContainEqual(expect.objectContaining({ type: "round_started", number: 1, youAreJudge: true }));
    const other = b.round!.participants[0]!;
    expect(detectMoments(view(a, other), view(b, other))).toContainEqual(expect.objectContaining({ type: "round_started", youAreJudge: false }));
  });

  it("todo mundo respondeu, revelação, vitória", () => {
    const a = started(4);
    const b = everyoneSubmits(a);
    expect(detectMoments(view(a, "p1"), view(b, "p1"))).toContainEqual({ type: "all_answered" });
    const judge = b.round!.judgeId;
    const c = ok(ok(b, { type: "REVEAL_NEXT" }, p(judge)), { type: "REVEAL_NEXT" }, p(judge));
    expect(detectMoments(view(b, "p1"), view(c, "p1"))).toEqual([
      { type: "answer_revealed", index: 0 },
      { type: "answer_revealed", index: 1 },
    ]);
    const d = judgePicks(c, 0);
    const winner = d.round!.winnerId!;
    expect(detectMoments(view(c, winner), view(d, winner))).toContainEqual(expect.objectContaining({ type: "round_won", youWon: true }));
  });

  it("nova rodada depois do resultado", () => {
    const a = judgePicks(everyoneSubmits(started(4)));
    const b = ok(a, { type: "TICK" }, p("p0"), T0 + RESULT_MS);
    expect(detectMoments(view(a, "p1"), view(b, "p1"))).toContainEqual(expect.objectContaining({ type: "round_started", number: 2 }));
  });

  it("virar anfitrião e pausa", () => {
    const a = started(3);
    const b = ok(a, { type: "LEAVE" }, p("p0"));
    const moments = detectMoments(view(a, "p1"), view(b, "p1"));
    expect(moments).toContainEqual({ type: "you_are_host" });
    expect(moments).toContainEqual({ type: "paused" });
  });

  it("toda frase de momento é legível", () => {
    expect(describeMoment({ type: "round_started", number: 3, youAreJudge: true, judgeName: "Ana" })).toBe("Rodada 3. Você é o juiz.");
    expect(describeMoment({ type: "game_over", youWon: false, winnerNames: ["Ana", "Beto"] })).toBe("Ana e Beto empataram e venceram a partida.");
    expect(describeMoment({ type: "game_over", youWon: false, winnerNames: ["Ana"] })).toBe("Ana venceu a partida.");
  });
});
