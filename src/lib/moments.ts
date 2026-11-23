import type { PlayerView } from "@/engine";

/**
 * "Momentos" da partida: o que mudou entre duas visões do mesmo jogador.
 * A tela usa isso para tocar som, vibrar, mostrar um aviso grande e anunciar
 * para leitores de tela. Função pura: fácil de testar.
 */
export type Moment =
  | { type: "game_started" }
  | { type: "round_started"; number: number; youAreJudge: boolean; judgeName: string }
  | { type: "all_answered" }
  | { type: "answer_revealed"; index: number }
  | { type: "round_won"; winnerName: string; youWon: boolean }
  | { type: "game_over"; youWon: boolean; winnerNames: string[] }
  | { type: "player_joined"; nickname: string }
  | { type: "player_left"; nickname: string }
  | { type: "you_are_host" }
  | { type: "paused" }
  | { type: "resumed" };

const name = (v: PlayerView, id: string | null | undefined) => v.players.find((p) => p.id === id)?.nickname ?? "Alguém";

export function detectMoments(prev: PlayerView | null, next: PlayerView): Moment[] {
  if (!prev || !next.you) return [];
  const out: Moment[] = [];
  const me = next.you.id;

  if (prev.phase === "lobby" && next.phase !== "lobby" && next.phase !== "game_over") out.push({ type: "game_started" });

  const pr = prev.round;
  const nr = next.round;

  if (nr && next.phase === "submitting" && (!pr || pr.number !== nr.number || prev.phase !== "submitting")) {
    out.push({ type: "round_started", number: nr.number, youAreJudge: nr.judgeId === me, judgeName: name(next, nr.judgeId) });
  }
  if (next.phase === "judging" && prev.phase !== "judging") out.push({ type: "all_answered" });
  if (next.phase === "judging" && prev.phase === "judging" && pr && nr) {
    const before = pr.answers.filter((a) => a.cards !== null).length;
    const after = nr.answers.filter((a) => a.cards !== null).length;
    for (let i = before; i < after; i++) out.push({ type: "answer_revealed", index: i });
  }
  if (next.phase === "round_result" && prev.phase !== "round_result" && nr) {
    out.push({ type: "round_won", winnerName: name(next, nr.winnerId), youWon: nr.winnerId === me });
  }
  if (next.phase === "game_over" && prev.phase !== "game_over" && next.result) {
    out.push({
      type: "game_over",
      youWon: next.result.winners.includes(me),
      winnerNames: next.result.winners.map((id) => next.result!.ranking.find((r) => r.id === id)?.nickname ?? "Alguém"),
    });
  }
  if (next.phase === "paused" && prev.phase !== "paused") out.push({ type: "paused" });
  if (prev.phase === "paused" && next.phase !== "paused") out.push({ type: "resumed" });

  const before = new Map(prev.players.map((p) => [p.id, p]));
  const after = new Map(next.players.map((p) => [p.id, p]));
  for (const p of next.players) if (!before.has(p.id) && p.id !== me) out.push({ type: "player_joined", nickname: p.nickname });
  for (const p of prev.players) if (!after.has(p.id) && p.id !== me) out.push({ type: "player_left", nickname: p.nickname });

  if (next.hostId === me && prev.hostId !== me) out.push({ type: "you_are_host" });
  return out;
}

/** Frase para o leitor de tela (e para o aviso grande, quando houver). */
export function describeMoment(m: Moment): string {
  switch (m.type) {
    case "game_started":
      return "A partida começou.";
    case "round_started":
      return m.youAreJudge ? `Rodada ${m.number}. Você é o juiz.` : `Rodada ${m.number}. ${m.judgeName} é o juiz. Escolha sua resposta.`;
    case "all_answered":
      return "Todo mundo respondeu. Hora da revelação.";
    case "answer_revealed":
      return `Resposta ${m.index + 1} revelada.`;
    case "round_won":
      return m.youWon ? "Sua resposta venceu a rodada!" : `${m.winnerName} venceu a rodada.`;
    case "game_over":
      if (m.winnerNames.length > 1) return `${m.winnerNames.join(" e ")} empataram e venceram a partida.`;
      return m.youWon ? "Você venceu a partida!" : `${m.winnerNames[0] ?? "Alguém"} venceu a partida.`;
    case "player_joined":
      return `${m.nickname} entrou na farra.`;
    case "player_left":
      return `${m.nickname} saiu da sala.`;
    case "you_are_host":
      return "Agora você é o anfitrião da sala.";
    case "paused":
      return "Partida pausada: ficou pouca gente na sala.";
    case "resumed":
      return "A partida voltou.";
  }
}
