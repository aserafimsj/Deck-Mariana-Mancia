// Gera docs/demo/passa-o-celular.html (versão de um aparelho só) com as cartas do baralho base.
// Uso: node scripts/gerar-demo.mjs
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const deck = JSON.parse(readFileSync(path.join(root, "content/baralho-base.json"), "utf8"));
const cards = {
  perguntas: deck.perguntas.map((c) => ({ texto: c.texto, nivel: c.nivel })),
  respostas: deck.respostas.map((c) => ({ texto: c.texto, nivel: c.nivel })),
};
const template = readFileSync(path.join(root, "docs/demo/template.html"), "utf8");
const marker = '/*__CARDS__*/{"perguntas":[],"respostas":[]}';
if (!template.includes(marker)) throw new Error("marcador das cartas não encontrado no template");
// "<" escapado para o JSON nunca fechar a tag <script> por acidente.
const json = JSON.stringify(cards).replace(/</g, "\\u003c");
writeFileSync(path.join(root, "docs/demo/passa-o-celular.html"), template.replace(marker, json));
console.log(`passa-o-celular.html gerado: ${cards.perguntas.length} perguntas, ${cards.respostas.length} respostas`);
