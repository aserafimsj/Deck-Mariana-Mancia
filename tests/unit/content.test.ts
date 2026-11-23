import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { LIMITS } from "@/lib/game-config";
import { buildSeed, pickFor } from "../../scripts/seed-builder.mjs";

const ROOT = path.resolve(import.meta.dirname, "../..");
const raw = JSON.parse(readFileSync(path.join(ROOT, "content/baralho-base.json"), "utf8"));

const card = z.object({ texto: z.string(), nivel: z.literal([1, 2, 3, 4]), categoria: z.string() });
const schema = z.object({
  baralho: z.object({ slug: z.string().regex(/^[a-z0-9-]{2,40}$/), nome: z.string(), descricao: z.string(), gratuito: z.boolean() }),
  categorias: z.array(z.object({ slug: z.string().regex(/^[a-z0-9-]{2,40}$/), nome: z.string(), cor: z.string().regex(/^#[0-9A-Fa-f]{6}$/) })),
  perguntas: z.array(card),
  respostas: z.array(card),
});
const data = schema.parse(raw);

const blanks = (t: string) => t.match(/_{3,}/g)?.length ?? 0;
const norm = (t: string) => t.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/[^a-z0-9]/g, "");

describe("baralho base", () => {
  it("segue os limites do banco (tamanho, categorias)", () => {
    const slugs = new Set(data.categorias.map((c) => c.slug));
    for (const p of data.perguntas) {
      expect(p.texto.length, p.texto).toBeGreaterThanOrEqual(3);
      expect(p.texto.length, p.texto).toBeLessThanOrEqual(200);
      expect(slugs.has(p.categoria), p.categoria).toBe(true);
    }
    for (const r of data.respostas) {
      expect(r.texto.length, r.texto).toBeLessThanOrEqual(140);
      expect(slugs.has(r.categoria), r.categoria).toBe(true);
    }
  });

  it("não tem cartas repetidas (nem com diferença de acento ou pontuação)", () => {
    for (const list of [data.perguntas, data.respostas]) {
      const seen = new Map<string, string>();
      for (const c of list) {
        const key = norm(c.texto);
        expect(seen.has(key), `repetida: "${c.texto}" ≈ "${seen.get(key)}"`).toBe(false);
        seen.set(key, c.texto);
      }
    }
  });

  it("perguntas têm no máximo 2 lacunas, e respostas nenhuma", () => {
    for (const p of data.perguntas) expect(blanks(p.texto), p.texto).toBeLessThanOrEqual(2);
    for (const r of data.respostas) expect(blanks(r.texto), r.texto).toBe(0);
    expect(data.perguntas.filter((p) => pickFor(p.texto) === 2).length).toBeGreaterThanOrEqual(5);
  });

  it("respostas terminam com pontuação (ficam certas como frase e dentro da lacuna)", () => {
    for (const r of data.respostas) expect(r.texto, r.texto).toMatch(/[.!?"]$/);
  });

  it("cada nível tem cartas suficientes para uma sala cheia (10 pessoas, mão de 7)", () => {
    // Mínimo exigido pelo motor: jogadores × (mão + 1). Com folga para não repetir cartas cedo.
    const needed = LIMITS.players.max * (7 + 1);
    for (const level of [1, 2, 3, 4] as const) {
      const whites = data.respostas.filter((r) => r.nivel <= level).length;
      const blacks = data.perguntas.filter((p) => p.nivel <= level).length;
      expect(whites, `respostas até o nível ${level}`).toBeGreaterThanOrEqual(needed);
      expect(blacks, `perguntas até o nível ${level}`).toBeGreaterThanOrEqual(30);
    }
  });

  it("não cita nomes de pessoas, marcas ou programas reais conhecidos", () => {
    // Lista de verificação: nomes que já apareceram em rascunhos e não podem voltar.
    const proibidos = ["faustao", "uber", "tiktok", "instagram", "herbalife", "bbb", "vickvaporub", "whatsappweb"];
    for (const c of [...data.perguntas, ...data.respostas]) {
      for (const termo of proibidos) expect(norm(c.texto).includes(termo), `"${c.texto}" contém ${termo}`).toBe(false);
    }
  });

  it("supabase/seed.sql está atualizado com o JSON (rode `pnpm cartas`)", () => {
    expect(readFileSync(path.join(ROOT, "supabase/seed.sql"), "utf8")).toBe(buildSeed(data));
  });
});
