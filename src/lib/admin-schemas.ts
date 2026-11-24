import { z } from "zod";

/** Regras de conteúdo do painel administrativo. Valem na tela e, de novo, no servidor. */

export const CARD_KINDS = ["black", "white"] as const;
export type CardKind = (typeof CARD_KINDS)[number];
export const CARD_STATUS = ["draft", "active", "archived"] as const;
export type CardStatus = (typeof CARD_STATUS)[number];

export const STATUS_LABEL: Record<CardStatus, string> = { draft: "Rascunho", active: "Ativa", archived: "Arquivada" };
export const KIND_LABEL: Record<CardKind, string> = { black: "Pergunta", white: "Resposta" };

const BLANK = /_{3,}/g;

export function blanksIn(text: string) {
  return text.match(BLANK)?.length ?? 0;
}

/** Normaliza espaços e lacunas (qualquer sequência de 3+ sublinhados vira "___"). */
export function normalizeCardText(text: string) {
  return text.normalize("NFC").trim().replace(/\s+/g, " ").replace(BLANK, "___");
}

const slug = z.string().regex(/^[a-z0-9-]{2,40}$/, "Use letras minúsculas, números e hífen.");

function cardText(kind: CardKind) {
  return z
    .string()
    .transform(normalizeCardText)
    .pipe(
      z
        .string()
        .min(kind === "black" ? 3 : 2, "Texto curto demais.")
        .max(kind === "black" ? 200 : 140, `Máximo de ${kind === "black" ? 200 : 140} caracteres.`)
        .refine((t) => (kind === "black" ? blanksIn(t) <= 2 : blanksIn(t) === 0), kind === "black" ? "No máximo 2 lacunas (___)." : "Resposta não pode ter lacuna (___)."),
    );
}

function cardFields(kind: CardKind) {
  return { text: cardText(kind), humorLevel: z.literal([1, 2, 3, 4]), categorySlug: slug.nullable(), status: z.enum(CARD_STATUS) };
}

export function cardInputSchema(kind: CardKind) {
  const f = cardFields(kind);
  return z.object({ ...f, status: f.status.default("active") });
}

/** Edição: só os campos enviados mudam (sem valores padrão, para não reativar carta arquivada sem querer). */
export function cardPatchSchema(kind: CardKind) {
  return z
    .object(cardFields(kind))
    .partial()
    .refine((v) => Object.values(v).some((x) => x !== undefined), "Nada para alterar.");
}

export type CardInput = z.infer<ReturnType<typeof cardInputSchema>>;

export const categoryInputSchema = z.object({
  slug,
  name: z.string().trim().min(2).max(40),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Cor no formato #RRGGBB.").nullable().default(null),
  isActive: z.boolean().default(true),
});

/** Edição de categoria: sem valores padrão (renomear não pode apagar a cor nem reativar). */
export const categoryPatchSchema = z
  .object({
    name: z.string().trim().min(2).max(40),
    color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Cor no formato #RRGGBB.").nullable(),
    isActive: z.boolean(),
  })
  .partial();

export const ROLES = ["admin", "editor"] as const;
export type Role = (typeof ROLES)[number];

export const grantRoleSchema = z.object({ email: z.email("E-mail inválido."), role: z.enum(ROLES) });

// ---------------------------------------------------------------------------
// Importação em lote (CSV)
// ---------------------------------------------------------------------------

export type ImportRow = { line: number; text: string; humorLevel: number; categorySlug: string | null };
export type ImportResult = { rows: ImportRow[]; errors: { line: number; message: string }[] };

/** Divide uma linha de CSV respeitando aspas ("texto, com vírgula"). */
function splitCsvLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

/**
 * Lê um CSV com as colunas: texto; nível (1 a 4); categoria (opcional).
 * Aceita ponto e vírgula (padrão do Excel em português) ou vírgula. Cabeçalho é ignorado.
 */
export function parseCardsCsv(csv: string, kind: CardKind): ImportResult {
  const lines = csv.replace(/^﻿/, "").split(/\r?\n/);
  const sample = lines.find((l) => l.trim()) ?? "";
  const sep = sample.includes(";") ? ";" : ",";
  const schema = cardInputSchema(kind);
  const result: ImportResult = { rows: [], errors: [] };
  lines.forEach((raw, idx) => {
    const line = idx + 1;
    if (!raw.trim()) return;
    const [text = "", level = "", category = ""] = splitCsvLine(raw, sep);
    if (idx === 0 && /^(texto|text)$/i.test(text)) return; // cabeçalho
    const parsed = schema.safeParse({ text, humorLevel: Number(level), categorySlug: category ? category.toLowerCase() : null });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const field = issue?.path[0] === "humorLevel" ? "Nível precisa ser 1, 2, 3 ou 4." : (issue?.message ?? "Linha inválida.");
      result.errors.push({ line, message: field });
      return;
    }
    result.rows.push({ line, text: parsed.data.text, humorLevel: parsed.data.humorLevel, categorySlug: parsed.data.categorySlug });
  });
  return result;
}
