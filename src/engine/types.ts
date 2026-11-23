import type { HumorLevel, RoomSettings } from "@/lib/game-config";

/**
 * Motor do jogo — tipos.
 * O estado completo (GameState) só existe no servidor. Cada jogador recebe uma PlayerView,
 * gerada por projectFor(), que contém apenas o que ele pode ver naquele momento.
 */

export type WhiteCard = { id: string; text: string };
export type BlackCard = { id: string; text: string; pick: 1 | 2 };

/** Cartas candidatas fornecidas pelo servidor ao iniciar a partida (já filtradas por categoria). */
export type CardPool = {
  black: (BlackCard & { humorLevel: HumorLevel })[];
  white: (WhiteCard & { humorLevel: HumorLevel })[];
};

export type Phase = "lobby" | "submitting" | "judging" | "round_result" | "paused" | "game_over";

export type PlayerStatus = "active" | "left" | "kicked";

export type PlayerState = {
  id: string;
  nickname: string;
  /** Ordem de chegada; define o rodízio do juiz. */
  seat: number;
  status: PlayerStatus;
  connected: boolean;
  /** Quando caiu da rede (ms). null = conectado. */
  disconnectedAt: number | null;
  acceptedLevel4: boolean;
  score: number;
  roundsWon: number;
  hand: WhiteCard[];
  joinedAt: number;
};

export type Submission = { cards: WhiteCard[]; submittedAt: number };

export type RoundState = {
  number: number;
  judgeId: string;
  blackCard: BlackCard;
  startedAt: number;
  /** Prazo da fase atual (resposta ou julgamento). null = sem limite de tempo. */
  deadline: number | null;
  /** Quem deve responder nesta rodada (presentes no início, exceto o juiz). */
  participants: string[];
  submissions: Record<string, Submission>;
  /** Ordem embaralhada das respostas na revelação (ids de jogadores — nunca enviados aos clientes). */
  revealOrder: string[];
  /** Quantas respostas o juiz já revelou. */
  revealed: number;
  winnerId: string | null;
  /** Quando a tela de resultado termina e a próxima rodada começa. */
  nextRoundAt: number | null;
};

export type RoundEndReason = "judged" | "timeout" | "judge_left" | "cancelled";

export type RoundSummary = {
  number: number;
  judgeId: string;
  blackCard: BlackCard;
  winnerId: string | null;
  endReason: RoundEndReason;
  submissions: { playerId: string; cards: WhiteCard[]; ms: number }[];
};

export type GameState = {
  schemaVersion: 1;
  phase: Phase;
  /** Fase interrompida quando a partida pausou por falta de jogadores. */
  pausedReason: "not_enough_players" | null;
  hostId: string;
  settings: RoomSettings;
  players: Record<string, PlayerState>;
  deck: { black: BlackCard[]; white: WhiteCard[]; blackDiscard: BlackCard[]; whiteDiscard: WhiteCard[] };
  round: RoundState | null;
  /** Último juiz (para o rodízio). */
  lastJudgeId: string | null;
  /** Rodadas com vencedor (contam para o limite de rodadas). */
  roundsPlayed: number;
  history: RoundSummary[];
  startedAt: number | null;
  endedAt: number | null;
  winners: string[];
  /** Estado do gerador aleatório com semente (determinístico e reproduzível). */
  rng: number;
};

export type Actor = { type: "player"; id: string } | { type: "system" };

export type GameAction =
  | { type: "JOIN"; nickname: string; acceptedLevel4?: boolean }
  | { type: "LEAVE" }
  | { type: "KICK"; playerId: string }
  | { type: "TRANSFER_HOST"; playerId: string }
  | { type: "UPDATE_SETTINGS"; settings: Partial<RoomSettings> }
  | { type: "ACCEPT_LEVEL4" }
  | { type: "START_GAME" }
  | { type: "SUBMIT"; cardIds: string[] }
  | { type: "REVEAL_NEXT" }
  | { type: "PICK_WINNER"; answerIndex: number }
  | { type: "NEXT_ROUND" }
  | { type: "PLAY_AGAIN" }
  | { type: "TICK" }
  | { type: "SET_CONNECTION"; playerId: string; connected: boolean };

export type ActionContext = {
  /** Hora atual em ms, fornecida pelo servidor. O motor nunca lê o relógio sozinho. */
  now: number;
  /** Obrigatório em START_GAME: cartas carregadas do banco pelo servidor. */
  cards?: CardPool;
};

export type GameEvent =
  | { type: "player_joined"; playerId: string; rejoined: boolean }
  | { type: "player_left"; playerId: string }
  | { type: "player_kicked"; playerId: string }
  | { type: "host_changed"; playerId: string }
  | { type: "settings_changed" }
  | { type: "game_started" }
  | { type: "round_started"; number: number; judgeId: string }
  | { type: "answer_submitted"; playerId: string }
  | { type: "judging_started"; answers: number }
  | { type: "answer_revealed"; index: number }
  | { type: "round_won"; summary: RoundSummary }
  | { type: "round_cancelled"; summary: RoundSummary }
  | { type: "paused" }
  | { type: "resumed" }
  | { type: "game_over"; winners: string[] }
  | { type: "back_to_lobby" };

export type ErrorCode =
  | "NOT_IN_ROOM"
  | "NOT_HOST"
  | "WRONG_PHASE"
  | "NOT_JUDGE"
  | "JUDGE_CANNOT_ANSWER"
  | "NOT_PARTICIPANT"
  | "ALREADY_SUBMITTED"
  | "INVALID_CARDS"
  | "ROOM_FULL"
  | "NICKNAME_TAKEN"
  | "INVALID_NICKNAME"
  | "KICKED"
  | "NOT_ENOUGH_PLAYERS"
  | "LEVEL4_NOT_ACCEPTED"
  | "NOT_ENOUGH_CARDS"
  | "NOT_ALL_REVEALED"
  | "INVALID_ANSWER"
  | "INVALID_TARGET"
  | "INVALID_SETTINGS"
  | "SYSTEM_ONLY";

export type GameError = { code: ErrorCode; message: string };

export type ActionResult =
  | { ok: true; state: GameState; events: GameEvent[]; changed: boolean }
  | { ok: false; error: GameError };
