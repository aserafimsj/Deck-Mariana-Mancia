import { z } from "zod";
import { roomSettingsSchema } from "./game-config";

/**
 * Formato das requisições que o celular manda. O servidor valida tudo de novo;
 * ações de sistema (conexão, manutenção) nunca são aceitas do cliente.
 */

export const createRoomBody = z.object({
  nickname: z.string().max(64),
  settings: roomSettingsSchema.partial().optional(),
});

export const joinRoomBody = z.object({
  nickname: z.string().max(64),
  acceptedLevel4: z.boolean().optional(),
});

export const clientActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("LEAVE") }),
  z.object({ type: z.literal("KICK"), playerId: z.uuid() }),
  z.object({ type: z.literal("TRANSFER_HOST"), playerId: z.uuid() }),
  z.object({ type: z.literal("UPDATE_SETTINGS"), settings: roomSettingsSchema.partial() }),
  z.object({ type: z.literal("ACCEPT_LEVEL4") }),
  z.object({ type: z.literal("START_GAME") }),
  z.object({ type: z.literal("SUBMIT"), cardIds: z.array(z.string().max(64)).min(1).max(2) }),
  z.object({ type: z.literal("REVEAL_NEXT") }),
  z.object({ type: z.literal("PICK_WINNER"), answerIndex: z.int().min(0).max(20) }),
  z.object({ type: z.literal("NEXT_ROUND") }),
  z.object({ type: z.literal("PLAY_AGAIN") }),
]);

export type ClientAction = z.infer<typeof clientActionSchema>;

export const actionBody = z.object({
  clientActionId: z.uuid(),
  action: clientActionSchema,
});
