/** Lacuna nas cartas pergunta: três ou mais sublinhados. No banco usamos exatamente "___". */
const BLANK_RE = /_{3,}/g;

export type CardPart = { type: "text"; value: string } | { type: "blank" };
export type FilledPart = { type: "text"; value: string } | { type: "answer"; value: string };

export function countBlanks(text: string): number {
  return text.match(BLANK_RE)?.length ?? 0;
}

/** Divide o texto da carta em trechos e lacunas, para renderizar a lacuna com estilo próprio. */
export function splitCardText(text: string): CardPart[] {
  const parts: CardPart[] = [];
  let last = 0;
  for (const match of text.matchAll(BLANK_RE)) {
    const index = match.index ?? 0;
    if (index > last) parts.push({ type: "text", value: text.slice(last, index) });
    parts.push({ type: "blank" });
    last = index + match[0].length;
  }
  if (last < text.length) parts.push({ type: "text", value: text.slice(last) });
  return parts;
}

/**
 * Ajusta a resposta para caber no meio da frase: tira o ponto final e
 * põe a primeira letra em minúscula. Siglas (primeira palavra toda em maiúsculas,
 * com 2+ letras, como "PIX") ficam como estão.
 * Limitação conhecida: nomes próprios no início da resposta também viram minúscula.
 */
export function answerForBlank(answer: string): string {
  const trimmed = answer.trim().replace(/[.!]+$/, "");
  const firstWord = trimmed.split(/\s+/)[0] ?? "";
  const isAcronym = /\p{L}.*\p{L}/u.test(firstWord) && firstWord === firstWord.toUpperCase();
  return isAcronym ? trimmed : trimmed.charAt(0).toLowerCase() + trimmed.slice(1);
}

/**
 * Monta a frase final da rodada.
 * - Com lacunas: cada resposta ocupa uma lacuna, em ordem.
 * - Sem lacunas (pergunta direta): a pergunta seguida das respostas inteiras.
 */
export function fillCard(question: string, answers: readonly string[]): FilledPart[] {
  const parts = splitCardText(question);
  const blanks = parts.filter((p) => p.type === "blank").length;

  if (blanks === 0) {
    return [
      { type: "text", value: question.trim() + " " },
      ...answers.map((a, i): FilledPart => ({ type: "answer", value: (i > 0 ? " " : "") + a.trim() })),
    ];
  }

  let next = 0;
  return parts.map((p): FilledPart => {
    if (p.type === "text") return p;
    const answer = answers[next++];
    return answer === undefined ? { type: "text", value: "___" } : { type: "answer", value: answerForBlank(answer) };
  });
}

export function filledToString(parts: readonly FilledPart[]): string {
  return parts.map((p) => p.value).join("");
}
