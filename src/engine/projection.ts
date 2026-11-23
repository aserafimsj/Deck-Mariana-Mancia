import type { RoomSettings } from "@/lib/game-config";
import { isPresent } from "./reducer";
import type { BlackCard, GameState, Phase, WhiteCard } from "./types";

/**
 * Visão de um jogador. É a ÚNICA forma de o estado sair do servidor.
 * Regras de sigilo:
 *  - a mão de cada jogador só aparece para ele mesmo;
 *  - durante as respostas, ninguém vê o que os outros mandaram (só quem já mandou);
 *  - no julgamento, as respostas aparecem sem autor e só depois de reveladas pelo juiz;
 *  - o autor de cada resposta só aparece depois que o juiz escolhe;
 *  - o baralho e o descarte nunca saem do servidor.
 */
export type PlayerView = {
  phase: Phase;
  pausedReason: GameState["pausedReason"];
  settings: RoomSettings;
  hostId: string;
  you: {
    id: string;
    isHost: boolean;
    isJudge: boolean;
    hand: WhiteCard[];
    /** Precisa aceitar o aviso Sem Filtro antes de jogar. */
    needsLevel4Accept: boolean;
    /** Entrou no meio da rodada: joga a partir da próxima. */
    waitingNextRound: boolean;
    submission: WhiteCard[] | null;
  } | null;
  players: {
    id: string;
    nickname: string;
    seat: number;
    score: number;
    roundsWon: number;
    online: boolean;
    isHost: boolean;
    isJudge: boolean;
    /** Só durante as respostas: já respondeu? */
    hasSubmitted: boolean;
  }[];
  round: {
    number: number;
    judgeId: string;
    blackCard: BlackCard;
    deadline: number | null;
    submittedCount: number;
    requiredCount: number;
    /** Julgamento e resultado: uma entrada por resposta, na ordem embaralhada. */
    answers: { index: number; cards: WhiteCard[] | null; playerId: string | null; winner: boolean }[];
    winnerId: string | null;
    nextRoundAt: number | null;
  } | null;
  result: {
    winners: string[];
    ranking: { id: string; nickname: string; score: number; roundsWon: number; rank: number }[];
    stats: GameStats;
  } | null;
};

export type GameStats = {
  rounds: number;
  durationMs: number;
  fastest: { playerId: string; avgMs: number } | null;
  winningCards: { playerId: string; text: string }[];
};

export function computeStats(s: GameState): GameStats {
  const judged = s.history.filter((h) => h.winnerId !== null);
  const times = new Map<string, number[]>();
  for (const h of s.history) for (const sub of h.submissions) times.set(sub.playerId, [...(times.get(sub.playerId) ?? []), sub.ms]);
  let fastest: GameStats["fastest"] = null;
  for (const [playerId, list] of times) {
    const avgMs = Math.round(list.reduce((a, b) => a + b, 0) / list.length);
    if (!fastest || avgMs < fastest.avgMs) fastest = { playerId, avgMs };
  }
  return {
    rounds: judged.length,
    durationMs: s.startedAt !== null ? (s.endedAt ?? s.startedAt) - s.startedAt : 0,
    fastest,
    winningCards: judged.map((h) => {
      const sub = h.submissions.find((x) => x.playerId === h.winnerId);
      return { playerId: h.winnerId!, text: sub?.cards.map((c) => c.text).join(" + ") ?? "" };
    }),
  };
}

export function projectFor(s: GameState, playerId: string, now: number): PlayerView {
  const me = s.players[playerId];
  const isMember = me !== undefined && me.status === "active";
  const r = s.round;
  const showRound = r !== null && (s.phase === "submitting" || s.phase === "judging" || s.phase === "round_result");

  const players = Object.values(s.players)
    .filter((p) => p.status === "active")
    .sort((a, b) => a.seat - b.seat)
    .map((p) => ({
      id: p.id,
      nickname: p.nickname,
      seat: p.seat,
      score: p.score,
      roundsWon: p.roundsWon,
      online: p.connected,
      isHost: p.id === s.hostId,
      isJudge: showRound && r!.judgeId === p.id,
      hasSubmitted: s.phase === "submitting" && r !== null && r.submissions[p.id] !== undefined,
    }));

  let round: PlayerView["round"] = null;
  if (showRound && r) {
    const decided = s.phase === "round_result";
    const answers =
      s.phase === "submitting"
        ? []
        : r.revealOrder.map((authorId, index) => {
            const visible = decided || index < r.revealed;
            return {
              index,
              cards: visible ? r.submissions[authorId]!.cards : null,
              playerId: decided ? authorId : null,
              winner: decided && authorId === r.winnerId,
            };
          });
    const required = r.participants.filter((id) => {
      const p = s.players[id];
      return p && isPresent(p, now);
    });
    round = {
      number: r.number,
      judgeId: r.judgeId,
      blackCard: r.blackCard,
      deadline: r.deadline,
      submittedCount: Object.keys(r.submissions).length,
      requiredCount: required.length,
      answers,
      winnerId: decided ? r.winnerId : null,
      nextRoundAt: decided ? r.nextRoundAt : null,
    };
  }

  let result: PlayerView["result"] = null;
  if (s.phase === "game_over") {
    const sorted = Object.values(s.players)
      .filter((p) => p.status !== "kicked")
      .sort((a, b) => b.score - a.score || b.roundsWon - a.roundsWon || a.seat - b.seat);
    const ranking = sorted.map((p) => ({
      id: p.id,
      nickname: p.nickname,
      score: p.score,
      roundsWon: p.roundsWon,
      rank: 1 + sorted.filter((q) => q.score > p.score).length,
    }));
    result = { winners: s.winners, ranking, stats: computeStats(s) };
  }

  return {
    phase: s.phase,
    pausedReason: s.pausedReason,
    settings: s.settings,
    hostId: s.hostId,
    you: isMember
      ? {
          id: me.id,
          isHost: me.id === s.hostId,
          isJudge: showRound && r!.judgeId === me.id,
          hand: me.hand,
          needsLevel4Accept: s.settings.humorLevel === 4 && !me.acceptedLevel4,
          waitingNextRound: s.phase === "submitting" && r !== null && r.judgeId !== me.id && !r.participants.includes(me.id),
          submission: showRound && r ? (r.submissions[me.id]?.cards ?? null) : null,
        }
      : null,
    players,
    round,
    result,
  };
}
