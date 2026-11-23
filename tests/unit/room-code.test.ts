import { describe, expect, it } from "vitest";
import { generateRoomCode, isValidRoomCode, normalizeRoomCode, ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from "@/lib/room-code";

describe("código da sala", () => {
  it("gera códigos válidos de 5 caracteres sem ambíguos", () => {
    for (let i = 0; i < 2000; i++) {
      const code = generateRoomCode();
      expect(code).toHaveLength(ROOM_CODE_LENGTH);
      expect(isValidRoomCode(code)).toBe(true);
      expect(code).not.toMatch(/[01ILO]/);
    }
  });

  it("descarta bytes que causariam viés de módulo", () => {
    // 248 é o primeiro byte rejeitado para um alfabeto de 31 símbolos.
    const bytes = [255, 248, 0, 1, 2, 3, 4, 249, 250, 251];
    const code = generateRoomCode(() => Uint8Array.from(bytes));
    expect(code).toBe(ROOM_CODE_ALPHABET.slice(0, 5));
  });

  it("distribui os símbolos de forma aproximadamente uniforme", () => {
    const counts = new Map<string, number>();
    const samples = 20000;
    for (let i = 0; i < samples; i++) for (const c of generateRoomCode()) counts.set(c, (counts.get(c) ?? 0) + 1);
    const expected = (samples * ROOM_CODE_LENGTH) / ROOM_CODE_ALPHABET.length;
    expect(counts.size).toBe(ROOM_CODE_ALPHABET.length);
    for (const n of counts.values()) expect(Math.abs(n - expected) / expected).toBeLessThan(0.1);
  });

  it("normaliza o que a pessoa digita", () => {
    expect(normalizeRoomCode(" kz7-pa ")).toBe("KZ7PA");
    expect(normalizeRoomCode("k z 7 p a")).toBe("KZ7PA");
  });

  it("recusa códigos inválidos", () => {
    expect(isValidRoomCode("KZ7P")).toBe(false);
    expect(isValidRoomCode("KZ7PAA")).toBe(false);
    expect(isValidRoomCode("KZ0PA")).toBe(false);
    expect(isValidRoomCode("kz7pa")).toBe(false);
  });
});
