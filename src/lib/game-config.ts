import { z } from "zod";

/** Níveis de humor (decisão D2 do plano). */
export const HUMOR_LEVELS = [
  {
    level: 1,
    name: "De Leve",
    description: "Absurdo e zoeira do dia a dia. Dá para jogar com a tia.",
    activation: "Livre",
  },
  {
    level: 2,
    name: "Picante",
    description: "Duplo sentido, palavrão leve, vergonha alheia.",
    activation: "Padrão",
  },
  {
    level: 3,
    name: "Pesado",
    description: "Palavrão, sexo entre adultos, humor negro, escatologia.",
    activation: "Anfitrião escolhe",
  },
  {
    level: 4,
    name: "Sem Filtro",
    description: "Humor negro extremo, religião, política, tragédia, mau gosto proposital.",
    activation: "Anfitrião + aceite de cada jogador",
  },
] as const;

export type HumorLevel = (typeof HUMOR_LEVELS)[number]["level"];

export function humorLevelInfo(level: HumorLevel) {
  return HUMOR_LEVELS[level - 1];
}

export const LIMITS = {
  players: { min: 3, max: 10 },
  pointsToWin: { min: 3, max: 15 },
  handSize: { min: 5, max: 10 },
  maxRounds: { min: 5, max: 50 },
} as const;

/** 0 = sem limite de tempo. */
export const ANSWER_TIMER_OPTIONS = [0, 45, 60, 90] as const;

const slug = z.string().regex(/^[a-z0-9-]{2,40}$/);

export const roomSettingsSchema = z.object({
  pointsToWin: z.int().min(LIMITS.pointsToWin.min).max(LIMITS.pointsToWin.max).default(7),
  handSize: z.int().min(LIMITS.handSize.min).max(LIMITS.handSize.max).default(7),
  answerSeconds: z.literal(ANSWER_TIMER_OPTIONS).default(60),
  humorLevel: z.literal([1, 2, 3, 4]).default(2),
  maxPlayers: z.int().min(LIMITS.players.min).max(LIMITS.players.max).default(8),
  /** null = a partida termina só por pontos. */
  maxRounds: z.int().min(LIMITS.maxRounds.min).max(LIMITS.maxRounds.max).nullable().default(null),
  /** Vazio = todas as categorias ativas. */
  categorySlugs: z.array(slug).max(20).default([]),
});

export type RoomSettings = z.infer<typeof roomSettingsSchema>;

export const DEFAULT_ROOM_SETTINGS: RoomSettings = roomSettingsSchema.parse({});
