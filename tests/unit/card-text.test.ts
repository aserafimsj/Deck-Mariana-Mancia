import { describe, expect, it } from "vitest";
import { answerForBlank, countBlanks, fillCard, filledToString, splitCardText } from "@/lib/card-text";

describe("texto das cartas", () => {
  it("conta lacunas", () => {
    expect(countBlanks("Qual é o segredo?")).toBe(0);
    expect(countBlanks("Preciso parar com ___.")).toBe(1);
    expect(countBlanks("___ + _____ = sexta.")).toBe(2);
  });

  it("separa texto e lacunas", () => {
    expect(splitCardText("___ + ___ = sexta-feira perfeita.")).toEqual([
      { type: "blank" },
      { type: "text", value: " + " },
      { type: "blank" },
      { type: "text", value: " = sexta-feira perfeita." },
    ]);
    expect(splitCardText("Sem lacuna")).toEqual([{ type: "text", value: "Sem lacuna" }]);
  });

  it("ajusta a resposta para o meio da frase", () => {
    expect(answerForBlank("Um boleto vencido.")).toBe("um boleto vencido");
    expect(answerForBlank("PIX de R$ 3,50.")).toBe("PIX de R$ 3,50");
    expect(answerForBlank("WhatsApp da firma!")).toBe("whatsApp da firma");
    expect(answerForBlank("A última coxinha.")).toBe("a última coxinha");
    expect(answerForBlank("É tudo culpa do estagiário.")).toBe("é tudo culpa do estagiário");
    expect(answerForBlank("UFO na laje.")).toBe("UFO na laje");
  });

  it("monta a frase com uma lacuna", () => {
    const parts = fillCard("O síndico proibiu ___ na piscina.", ["Chinelo voador de alta precisão."]);
    expect(filledToString(parts)).toBe("O síndico proibiu chinelo voador de alta precisão na piscina.");
    expect(parts.filter((p) => p.type === "answer")).toHaveLength(1);
  });

  it("monta a frase com duas lacunas, na ordem escolhida", () => {
    expect(filledToString(fillCard("___ + ___ = sexta-feira perfeita.", ["Um pastel de vento.", "A última coxinha."]))).toBe(
      "um pastel de vento + a última coxinha = sexta-feira perfeita.",
    );
  });

  it("mantém a lacuna se faltar resposta", () => {
    expect(filledToString(fillCard("___ + ___", ["Um boleto."]))).toBe("um boleto + ___");
  });

  it("pergunta direta: pergunta seguida da resposta inteira", () => {
    expect(filledToString(fillCard("Qual é o segredo para conquistar alguém?", ["Um boleto vencido."]))).toBe(
      "Qual é o segredo para conquistar alguém? Um boleto vencido.",
    );
  });
});
