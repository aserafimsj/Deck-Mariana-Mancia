import { describe, expect, it } from "vitest";
import { cardInputSchema, cardPatchSchema, categoryInputSchema, categoryPatchSchema, normalizeCardText, parseCardsCsv } from "@/lib/admin-schemas";

describe("painel: validação de cartas", () => {
  it("normaliza espaços e lacunas", () => {
    expect(normalizeCardText("  Meu   ex me trocou por _____ .  ")).toBe("Meu ex me trocou por ___ .");
  });

  it("pergunta aceita até 2 lacunas; resposta nenhuma", () => {
    const black = cardInputSchema("black");
    const white = cardInputSchema("white");
    expect(black.safeParse({ text: "___ e ___ e ___", humorLevel: 1, categorySlug: null }).success).toBe(false);
    expect(black.safeParse({ text: "___ e ___", humorLevel: 1, categorySlug: null }).success).toBe(true);
    expect(white.safeParse({ text: "Um ___.", humorLevel: 1, categorySlug: null }).success).toBe(false);
    expect(white.safeParse({ text: "Um boleto.", humorLevel: 2, categorySlug: "cotidiano" }).data).toMatchObject({ status: "active" });
  });

  it("recusa nível, tamanho e categoria inválidos", () => {
    const white = cardInputSchema("white");
    expect(white.safeParse({ text: "Ok.", humorLevel: 5, categorySlug: null }).success).toBe(false);
    expect(white.safeParse({ text: "x".repeat(141), humorLevel: 1, categorySlug: null }).success).toBe(false);
    expect(white.safeParse({ text: "Ok.", humorLevel: 1, categorySlug: "Com Espaço" }).success).toBe(false);
  });

  it("edição precisa mudar alguma coisa", () => {
    expect(cardPatchSchema("white").safeParse({}).success).toBe(false);
    expect(cardPatchSchema("white").safeParse({ status: "archived" }).success).toBe(true);
    // Editar só o texto não pode mexer no status (não reativa carta arquivada).
    expect(cardPatchSchema("white").safeParse({ text: "Novo texto." }).data).toEqual({ text: "Novo texto." });
  });

  it("categoria: identificador e cor", () => {
    expect(categoryInputSchema.safeParse({ slug: "futebol", name: "Futebol", color: "#FFCC1A" }).success).toBe(true);
    expect(categoryInputSchema.safeParse({ slug: "Futebol", name: "Futebol" }).success).toBe(false);
    expect(categoryInputSchema.safeParse({ slug: "futebol", name: "Futebol", color: "amarelo" }).success).toBe(false);
    // Renomear não mexe na cor nem no status.
    expect(categoryPatchSchema.parse({ name: "Novo nome" })).toEqual({ name: "Novo nome" });
  });
});

describe("painel: importação CSV", () => {
  it("lê ponto e vírgula (Excel em português), ignora cabeçalho e linhas vazias", () => {
    const csv = "texto;nivel;categoria\nUm boleto vencido.;1;cotidiano\n\nUm pombo.;2;\n";
    const r = parseCardsCsv(csv, "white");
    expect(r.errors).toEqual([]);
    expect(r.rows).toEqual([
      { line: 2, text: "Um boleto vencido.", humorLevel: 1, categorySlug: "cotidiano" },
      { line: 4, text: "Um pombo.", humorLevel: 2, categorySlug: null },
    ]);
  });

  it("lê vírgula com aspas e aspas escapadas", () => {
    const r = parseCardsCsv('"Ele disse ""oi"", e foi embora.",3,Absurdo', "white");
    expect(r.rows[0]).toMatchObject({ text: 'Ele disse "oi", e foi embora.', humorLevel: 3, categorySlug: "absurdo" });
  });

  it("aponta a linha de cada erro", () => {
    const r = parseCardsCsv("Pergunta sem nível;;\nCom ___ e ___ e ___;1;\nOk ___?;2;", "black");
    expect(r.errors).toEqual([
      { line: 1, message: "Nível precisa ser 1, 2, 3 ou 4." },
      { line: 2, message: "No máximo 2 lacunas (___)." },
    ]);
    expect(r.rows).toHaveLength(1);
  });

  it("tolera BOM e quebras de linha do Windows", () => {
    const r = parseCardsCsv("﻿Um.;1;\r\nDois.;2;\r\n", "white");
    expect(r.rows.map((x) => x.text)).toEqual(["Um.", "Dois."]);
  });
});
