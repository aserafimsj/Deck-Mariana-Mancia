import { describe, expect, it } from "vitest";
import { comparableForm, makeNicknameSchema, nicknameSchema, normalizeNickname } from "@/lib/nickname";

const ok = (v: string) => nicknameSchema.safeParse(v);

describe("apelido", () => {
  it("aceita nomes comuns, com acento e número", () => {
    for (const name of ["Ana", "João Pedro", "Zé_2", "Dona Cê", "mc.ruído", "Ñandu-7"]) {
      expect(ok(name).success, name).toBe(true);
    }
  });

  it("limpa espaços extras", () => {
    expect(normalizeNickname("  Ana    Clara ")).toBe("Ana Clara");
    expect(ok("  Ana    Clara ").data).toBe("Ana Clara");
  });

  it("respeita o tamanho de 2 a 16 caracteres", () => {
    expect(ok("A").success).toBe(false);
    expect(ok("A".repeat(17)).success).toBe(false);
    expect(ok("A".repeat(16)).success).toBe(true);
  });

  it("recusa símbolos, emojis e tags", () => {
    for (const bad of ["<script>", "Ana😀", "a/b", "---", "__"]) expect(ok(bad).success, bad).toBe(false);
  });

  it("explica o erro em português", () => {
    const r = ok("A");
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toMatch(/pelo menos 2/);
  });

  it("bloqueia nomes reservados mesmo disfarçados", () => {
    for (const bad of ["Admin", "ADM1N", "Juiz", "Anfitrião", "S1stema", "Scragbadum"]) {
      expect(ok(bad).success, bad).toBe(false);
    }
  });

  it("bloqueia termos da lista mesmo com acento, leetspeak ou separadores", () => {
    const schema = makeNicknameSchema(["palavrao"]);
    for (const bad of ["Palavrão", "p4l4vr40", "pa.la.vrao", "XPALAVRAOX"]) expect(schema.safeParse(bad).success, bad).toBe(false);
    expect(schema.safeParse("Ana").success).toBe(true);
  });

  it("gera a forma de comparação sem acentos e sem leetspeak", () => {
    expect(comparableForm("Ãn@ C1@ra")).toBe("anaciara");
  });
});
