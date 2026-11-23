// Gera supabase/seed.sql a partir de content/baralho-base.json.
// O JSON é a fonte das cartas; edite ele e rode `pnpm cartas`.

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;

/** Número de cartas resposta que a pergunta pede: 2 se tiver duas lacunas, senão 1. */
export function pickFor(text) {
  return (text.match(/_{3,}/g)?.length ?? 0) === 2 ? 2 : 1;
}

export function buildSeed(data) {
  const { baralho, categorias, perguntas, respostas } = data;
  const lines = [];
  lines.push("-- ARQUIVO GERADO por scripts/seed-builder.mjs a partir de content/baralho-base.json.");
  lines.push("-- Não edite à mão: altere o JSON e rode `pnpm cartas`.");
  lines.push("-- Todas as cartas são originais. Lacunas: ___ (três sublinhados).");
  lines.push("-- Níveis: 1 De Leve · 2 Picante · 3 Pesado · 4 Sem Filtro. Idempotente: pode rodar mais de uma vez.");
  lines.push("");
  lines.push("insert into public.decks (slug, name, description, is_free, sort_order)");
  lines.push(`values (${q(baralho.slug)}, ${q(baralho.nome)}, ${q(baralho.descricao)}, ${baralho.gratuito}, 0)`);
  lines.push("on conflict (slug) do nothing;");
  lines.push("");
  lines.push("insert into public.categories (slug, name, color, sort_order) values");
  lines.push(categorias.map((c, i) => `  (${q(c.slug)}, ${q(c.nome)}, ${q(c.cor)}, ${i})`).join(",\n"));
  lines.push("on conflict (slug) do nothing;");
  lines.push("");
  lines.push(`with d as (select id from public.decks where slug = ${q(baralho.slug)}),`);
  lines.push("c as (select id, slug from public.categories),");
  lines.push("src (text, pick, humor_level, category) as (values");
  lines.push(perguntas.map((p) => `  (${q(p.texto)}, ${pickFor(p.texto)}, ${p.nivel}, ${q(p.categoria)})`).join(",\n"));
  lines.push(")");
  lines.push("insert into public.black_cards (deck_id, category_id, text, pick, humor_level)");
  lines.push("select d.id, c.id, src.text, src.pick, src.humor_level");
  lines.push("from src cross join d left join c on c.slug = src.category");
  lines.push("on conflict (deck_id, lower(text)) do nothing;");
  lines.push("");
  lines.push(`with d as (select id from public.decks where slug = ${q(baralho.slug)}),`);
  lines.push("c as (select id, slug from public.categories),");
  lines.push("src (text, humor_level, category) as (values");
  lines.push(respostas.map((r) => `  (${q(r.texto)}, ${r.nivel}, ${q(r.categoria)})`).join(",\n"));
  lines.push(")");
  lines.push("insert into public.white_cards (deck_id, category_id, text, humor_level)");
  lines.push("select d.id, c.id, src.text, src.humor_level");
  lines.push("from src cross join d left join c on c.slug = src.category");
  lines.push("on conflict (deck_id, lower(text)) do nothing;");
  return lines.join("\n") + "\n";
}

// Uso pela linha de comando: node scripts/seed-builder.mjs
if (import.meta.url === `file://${process.argv[1]}`) {
  const { readFileSync, writeFileSync } = await import("node:fs");
  const path = await import("node:path");
  const root = path.resolve(import.meta.dirname, "..");
  const data = JSON.parse(readFileSync(path.join(root, "content/baralho-base.json"), "utf8"));
  writeFileSync(path.join(root, "supabase/seed.sql"), buildSeed(data));
  console.log(`seed.sql gerado: ${data.perguntas.length} perguntas, ${data.respostas.length} respostas`);
}
