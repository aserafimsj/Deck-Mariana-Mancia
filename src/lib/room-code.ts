/** Sem 0, 1, I, L e O para evitar confusão ao ditar ou digitar o código. */
export const ROOM_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const ROOM_CODE_LENGTH = 5;

const VALID = new RegExp(`^[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`);

type RandomBytes = (size: number) => Uint8Array;

const cryptoBytes: RandomBytes = (size) => crypto.getRandomValues(new Uint8Array(size));

/**
 * Gera um código de sala com distribuição uniforme (amostragem por rejeição, sem viés de módulo).
 * A unicidade é garantida pelo banco (índice único entre salas abertas); em caso de colisão, gere outro.
 */
export function generateRoomCode(randomBytes: RandomBytes = cryptoBytes): string {
  const n = ROOM_CODE_ALPHABET.length;
  const limit = 256 - (256 % n); // maior múltiplo de n que cabe em um byte
  let code = "";
  while (code.length < ROOM_CODE_LENGTH) {
    for (const byte of randomBytes(ROOM_CODE_LENGTH * 2)) {
      if (byte < limit) code += ROOM_CODE_ALPHABET[byte % n];
      if (code.length === ROOM_CODE_LENGTH) break;
    }
  }
  return code;
}

/** Aceita o que a pessoa digitou ("kz7 pa", "KZ7-PA") e devolve em maiúsculas sem separadores. */
export function normalizeRoomCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function isValidRoomCode(code: string): boolean {
  return VALID.test(code);
}
