import { z } from "zod";

export const NICKNAME_MIN = 2;
export const NICKNAME_MAX = 16;

/** Nomes que confundiriam os jogadores com papéis ou com o próprio sistema. */
const RESERVED = ["admin", "administrador", "moderador", "moderacao", "sistema", "scragbadum", "juiz", "anfitriao", "host"];

/**
 * Termos de ódio bloqueados em apelidos. A lista curada entra na Etapa 8 (testes e segurança);
 * o mecanismo de comparação (sem acento, sem leetspeak) já está pronto e testado.
 */
const BLOCKED_TERMS: string[] = [];

const LEET: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", $: "s" };

/** Forma usada só para comparação: minúsculas, sem acentos, sem leetspeak, sem separadores. */
export function comparableForm(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[013457@$]/g, (c) => LEET[c] ?? c)
    .replace(/[^a-z]/g, "");
}

export function normalizeNickname(value: string): string {
  return value.normalize("NFC").trim().replace(/\s+/g, " ");
}

function containsBlocked(value: string, terms: readonly string[]): boolean {
  const form = comparableForm(value);
  return terms.some((t) => t.length > 0 && form.includes(comparableForm(t)));
}

export function makeNicknameSchema(blocked: readonly string[] = BLOCKED_TERMS) {
  return z
    .string()
    .transform(normalizeNickname)
    .pipe(
      z
        .string()
        .min(NICKNAME_MIN, `O apelido precisa ter pelo menos ${NICKNAME_MIN} caracteres.`)
        .max(NICKNAME_MAX, `O apelido pode ter no máximo ${NICKNAME_MAX} caracteres.`)
        .regex(/^[\p{L}\p{N} ._-]+$/u, "Use só letras, números, espaço, ponto, hífen ou sublinhado.")
        .refine((v) => /[\p{L}\p{N}]/u.test(v), "O apelido precisa ter pelo menos uma letra ou número.")
        .refine((v) => !RESERVED.includes(comparableForm(v)), "Esse apelido é reservado. Escolhe outro?")
        .refine((v) => !containsBlocked(v, blocked), "Esse apelido não rola. Escolhe outro?"),
    );
}

export const nicknameSchema = makeNicknameSchema();
