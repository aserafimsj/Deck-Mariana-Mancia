import type { ErrorCode, GameError } from "./types";

/** Mensagens mostradas ao jogador: dizem o que aconteceu e o que fazer. */
const MESSAGES: Record<ErrorCode, string> = {
  NOT_IN_ROOM: "Você não está nesta sala. Entra de novo pelo código.",
  NOT_HOST: "Só quem criou a sala pode fazer isso.",
  WRONG_PHASE: "Isso não dá para fazer agora. A tela vai se atualizar.",
  NOT_JUDGE: "Só o juiz da rodada pode fazer isso.",
  JUDGE_CANNOT_ANSWER: "Você é o juiz desta rodada. Desta vez você só escolhe.",
  NOT_PARTICIPANT: "Você entrou no meio da rodada. Na próxima você joga.",
  ALREADY_SUBMITTED: "Sua resposta já foi enviada.",
  INVALID_CARDS: "Essas cartas não estão na sua mão. A tela vai se atualizar.",
  ROOM_FULL: "A sala está cheia.",
  NICKNAME_TAKEN: "Já tem alguém com esse apelido na sala. Escolhe outro?",
  INVALID_NICKNAME: "Apelido inválido.",
  KICKED: "Você foi removido desta sala pelo anfitrião.",
  NOT_ENOUGH_PLAYERS: "Faltam jogadores para começar.",
  LEVEL4_NOT_ACCEPTED: "Esta sala é Sem Filtro. Todo mundo precisa aceitar o aviso antes.",
  NOT_ENOUGH_CARDS: "Não há cartas suficientes com essas categorias e esse nível. Tenta liberar mais categorias.",
  NOT_ALL_REVEALED: "Revela todas as respostas antes de escolher.",
  INVALID_ANSWER: "Essa resposta não existe.",
  INVALID_TARGET: "Esse jogador não está na sala.",
  INVALID_SETTINGS: "Configuração inválida.",
  SYSTEM_ONLY: "Ação reservada ao servidor.",
};

export function gameError(code: ErrorCode, message?: string): GameError {
  return { code, message: message ?? MESSAGES[code] };
}
