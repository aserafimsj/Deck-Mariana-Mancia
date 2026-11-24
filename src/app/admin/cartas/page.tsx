"use client";

import { useCallback, useEffect, useState } from "react";
import { useMe } from "@/components/admin/AdminShell";
import { Empty, Level, PageTitle, Select, SmallButton, WinRate } from "@/components/admin/ui";
import { Button } from "@/components/ui/Button";
import { Hint, Label, TextInput } from "@/components/ui/Field";
import { Sheet } from "@/components/ui/Modal";
import { Notice } from "@/components/ui/Notice";
import { blanksIn, KIND_LABEL, STATUS_LABEL, type CardKind, type CardStatus } from "@/lib/admin-schemas";
import { adminFetch } from "@/lib/client/admin-api";
import { HUMOR_LEVELS } from "@/lib/game-config";

type Card = {
  id: string;
  kind: CardKind;
  text: string;
  pick: 1 | 2 | null;
  humorLevel: 1 | 2 | 3 | 4;
  status: CardStatus;
  categorySlug: string | null;
  categoryName: string | null;
  plays: number;
  wins: number;
};
type Category = { slug: string; name: string; isActive: boolean };
type List = { items: Card[]; total: number; pageSize: number };

const LEVEL_OPTIONS = [{ value: "", label: "Todos" }, ...HUMOR_LEVELS.map((l) => ({ value: String(l.level), label: `${l.level} · ${l.name}` }))];
const STATUS_OPTIONS = [{ value: "", label: "Todos" }, ...Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label }))];
const SORT_OPTIONS = [
  { value: "recent", label: "Editadas por último" },
  { value: "wins", label: "Mais vitórias" },
  { value: "plays", label: "Mais jogadas" },
  { value: "text", label: "Ordem alfabética" },
];

export default function CardsPage() {
  const me = useMe();
  const [kind, setKind] = useState<CardKind>("white");
  const [filters, setFilters] = useState({ q: "", level: "", category: "", status: "", sort: "recent" });
  const [page, setPage] = useState(1);
  const [list, setList] = useState<List | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [editing, setEditing] = useState<Card | "new" | null>(null);
  const [importing, setImporting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Card | null>(null);
  const [notice, setNotice] = useState<{ text: string; tone: "ok" | "error" } | null>(null);

  const load = useCallback(async () => {
    const qs = new URLSearchParams({ kind, page: String(page), sort: filters.sort });
    if (filters.q.trim()) qs.set("q", filters.q.trim());
    if (filters.level) qs.set("level", filters.level);
    if (filters.category) qs.set("category", filters.category);
    if (filters.status) qs.set("status", filters.status);
    const r = await adminFetch<List>(`/api/admin/cards?${qs}`);
    if (r.ok) setList(r.data);
    else setNotice({ text: r.message, tone: "error" });
  }, [kind, page, filters]);

  useEffect(() => {
    // Espera a pessoa parar de digitar na busca antes de consultar.
    const t = window.setTimeout(() => void load(), 250);
    return () => window.clearTimeout(t);
  }, [load]);

  useEffect(() => {
    void adminFetch<Category[]>("/api/admin/categories").then((r) => r.ok && setCategories(r.data));
  }, []);

  async function patch(card: Card, body: Record<string, unknown>, okText: string) {
    const r = await adminFetch(`/api/admin/cards/${card.kind}/${card.id}`, { method: "PATCH", body });
    setNotice(r.ok ? { text: okText, tone: "ok" } : { text: r.message, tone: "error" });
    if (r.ok) void load();
  }

  async function remove(card: Card) {
    setConfirmDelete(null);
    const r = await adminFetch(`/api/admin/cards/${card.kind}/${card.id}`, { method: "DELETE" });
    setNotice(r.ok ? { text: "Carta apagada.", tone: "ok" } : { text: r.message, tone: "error" });
    if (r.ok) void load();
  }

  const setFilter = (k: keyof typeof filters) => (v: string) => {
    setFilters((f) => ({ ...f, [k]: v }));
    setPage(1);
  };
  const categoryOptions = [{ value: "", label: "Todas" }, ...categories.map((c) => ({ value: c.slug, label: c.name })), { value: "none", label: "Sem categoria" }];
  const pages = list ? Math.max(1, Math.ceil(list.total / list.pageSize)) : 1;

  return (
    <>
      <PageTitle
        title="CARTAS"
        description="Mudanças valem na próxima partida que começar, sem precisar publicar nada. Cartas já usadas não podem ser apagadas: arquive para tirar do jogo e manter o histórico."
        actions={
          <>
            <SmallButton onClick={() => setImporting(true)}>Importar CSV</SmallButton>
            <SmallButton tone="primary" onClick={() => setEditing("new")}>
              Nova {kind === "black" ? "pergunta" : "resposta"}
            </SmallButton>
          </>
        }
      />

      <div className="flex gap-1 rounded-xl bg-breu-2 p-1" role="tablist" aria-label="Tipo de carta">
        {(["white", "black"] as const).map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={kind === k}
            onClick={() => {
              setKind(k);
              setPage(1);
            }}
            className={`flex-1 rounded-lg py-2 text-sm font-extrabold ${kind === k ? "bg-amarelo text-tinta" : "text-texto"}`}
          >
            {k === "white" ? "Respostas" : "Perguntas"}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <label htmlFor="f-q" className="col-span-2 grid gap-1 text-xs font-extrabold tracking-[.06em] text-texto-2 uppercase md:col-span-1">
          Buscar
          <input
            id="f-q"
            value={filters.q}
            onChange={(e) => setFilter("q")(e.target.value)}
            placeholder="Texto da carta"
            className="min-h-10 rounded-lg border-2 border-breu-3 bg-breu px-2 text-sm font-bold tracking-normal text-texto normal-case focus:border-amarelo focus:outline-none"
          />
        </label>
        <Select id="f-level" label="Nível" value={filters.level} onChange={setFilter("level")} options={LEVEL_OPTIONS} />
        <Select id="f-cat" label="Categoria" value={filters.category} onChange={setFilter("category")} options={categoryOptions} />
        <Select id="f-status" label="Status" value={filters.status} onChange={setFilter("status")} options={STATUS_OPTIONS} />
        <Select id="f-sort" label="Ordenar" value={filters.sort} onChange={setFilter("sort")} options={SORT_OPTIONS} />
      </div>

      {!list ? (
        <p role="status" className="text-texto-2">
          Carregando cartas...
        </p>
      ) : list.items.length === 0 ? (
        <Empty>Nenhuma carta com esses filtros.</Empty>
      ) : (
        <div className="overflow-x-auto rounded-2xl bg-breu-2">
          <table className="w-full min-w-[720px] text-left text-sm">
            <caption className="sr-only">{kind === "white" ? "Respostas" : "Perguntas"}</caption>
            <thead className="text-[11px] font-black tracking-[.08em] text-texto-2 uppercase">
              <tr className="border-b-2 border-breu-3">
                <th className="px-3 py-3">Texto</th>
                <th className="px-3 py-3">Nível</th>
                <th className="px-3 py-3">Categoria</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3">Vitórias</th>
                <th className="px-3 py-3">
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {list.items.map((c) => (
                <tr key={c.id} className="border-b border-breu-3 last:border-0">
                  <td className={`max-w-[420px] px-3 py-2.5 font-bold ${c.status !== "active" ? "text-texto-2" : ""}`}>
                    {c.text}
                    {c.pick === 2 && <span className="ml-2 rounded bg-amarelo px-1.5 py-0.5 text-[10px] font-black text-tinta">ESCOLHA 2</span>}
                  </td>
                  <td className="px-3 py-2.5">
                    <Level level={c.humorLevel} />
                  </td>
                  <td className="px-3 py-2.5 text-texto-2">{c.categoryName ?? "—"}</td>
                  <td className="px-3 py-2.5">
                    <span className={`rounded-md px-2 py-1 text-xs font-extrabold ${c.status === "active" ? "bg-ciano text-tinta" : "bg-breu-3 text-texto"}`}>{STATUS_LABEL[c.status]}</span>
                  </td>
                  <td className="px-3 py-2.5">
                    <WinRate plays={c.plays} wins={c.wins} />
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex justify-end gap-1.5">
                      <SmallButton onClick={() => setEditing(c)} aria-label={`Editar: ${c.text}`}>
                        Editar
                      </SmallButton>
                      {c.status === "active" ? (
                        <SmallButton onClick={() => patch(c, { status: "archived" }, "Carta arquivada: não aparece mais no jogo.")} aria-label={`Arquivar: ${c.text}`}>
                          Arquivar
                        </SmallButton>
                      ) : (
                        <SmallButton onClick={() => patch(c, { status: "active" }, "Carta ativada.")} aria-label={`Ativar: ${c.text}`}>
                          Ativar
                        </SmallButton>
                      )}
                      {me.isAdmin && c.plays === 0 && (
                        <SmallButton tone="danger" onClick={() => setConfirmDelete(c)} aria-label={`Apagar: ${c.text}`}>
                          Apagar
                        </SmallButton>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {list && pages > 1 && (
        <nav className="flex items-center justify-center gap-3" aria-label="Páginas">
          <SmallButton disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Anterior
          </SmallButton>
          <span className="text-sm text-texto-2">
            Página {page} de {pages} · {list.total} cartas
          </span>
          <SmallButton disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
            Próxima
          </SmallButton>
        </nav>
      )}

      {editing && (
        <CardForm
          key={editing === "new" ? `new-${kind}` : editing.id}
          kind={editing === "new" ? kind : editing.kind}
          card={editing === "new" ? null : editing}
          categories={categories}
          onClose={() => setEditing(null)}
          onSaved={(text) => {
            setEditing(null);
            setNotice({ text, tone: "ok" });
            void load();
          }}
        />
      )}
      <ImportSheet
        open={importing}
        kind={kind}
        onClose={() => setImporting(false)}
        onDone={(text) => {
          setImporting(false);
          setNotice({ text, tone: "ok" });
          void load();
        }}
      />
      <Sheet open={confirmDelete !== null} title="Apagar esta carta?" tone="danger" onClose={() => setConfirmDelete(null)}>
        <p className="text-sm">&quot;{confirmDelete?.text}&quot;</p>
        <p className="text-sm text-texto-2">Ela nunca foi jogada, então some de vez. Não dá para desfazer.</p>
        <Button block variant="danger" onClick={() => confirmDelete && remove(confirmDelete)}>
          Apagar
        </Button>
        <Button block variant="ghost" onClick={() => setConfirmDelete(null)}>
          Cancelar
        </Button>
      </Sheet>
      <Notice message={notice?.text ?? null} tone={notice?.tone} onClose={() => setNotice(null)} />
    </>
  );
}

function CardForm({ kind, card, categories, onClose, onSaved }: { kind: CardKind; card: Card | null; categories: Category[]; onClose: () => void; onSaved: (msg: string) => void }) {
  const [text, setText] = useState(card?.text ?? "");
  const [level, setLevel] = useState(String(card?.humorLevel ?? 1));
  const [category, setCategory] = useState(card?.categorySlug ?? "");
  const [status, setStatus] = useState<CardStatus>(card?.status ?? "active");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const blanks = blanksIn(text);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const payload = { text, humorLevel: Number(level), categorySlug: category || null, status };
    const r = card
      ? await adminFetch(`/api/admin/cards/${kind}/${card.id}`, { method: "PATCH", body: payload })
      : await adminFetch("/api/admin/cards", { method: "POST", body: { kind, card: payload } });
    setBusy(false);
    if (r.ok) onSaved(card ? "Carta atualizada." : "Carta criada.");
    else setError(r.message);
  }

  return (
    <Sheet open title={card ? `Editar ${KIND_LABEL[kind].toLowerCase()}` : `Nova ${KIND_LABEL[kind].toLowerCase()}`} onClose={onClose}>
      <form className="grid gap-3" onSubmit={save} noValidate>
        <div className="grid gap-1.5">
          <Label htmlFor="card-text">Texto</Label>
          <TextInput id="card-text" value={text} onChange={(e) => setText(e.target.value)} maxLength={220} autoFocus aria-describedby="card-text-hint" />
          <Hint id="card-text-hint">
            {kind === "black"
              ? `Use ___ (três sublinhados) para cada lacuna. ${blanks === 2 ? "Duas lacunas: vira carta ESCOLHA 2." : blanks === 1 ? "Uma lacuna." : "Sem lacuna: pergunta direta."}`
              : "Termine com ponto final. Respostas não têm lacuna."}
          </Hint>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Select id="card-level" label="Nível" value={level} onChange={setLevel} options={HUMOR_LEVELS.map((l) => ({ value: String(l.level), label: `${l.level} · ${l.name}` }))} />
          <Select id="card-cat" label="Categoria" value={category} onChange={setCategory} options={[{ value: "", label: "Sem categoria" }, ...categories.map((c) => ({ value: c.slug, label: c.name }))]} />
        </div>
        <Select id="card-status" label="Status" value={status} onChange={(v) => setStatus(v as CardStatus)} options={Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label }))} />
        {error && <Hint error>{error}</Hint>}
        <Button type="submit" block disabled={busy || text.trim().length < 2}>
          {busy ? "Salvando..." : "Salvar"}
        </Button>
        <Button block variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
      </form>
    </Sheet>
  );
}

type ImportReport = { valid: number; errors: { line: number; message: string }[]; imported: boolean; created?: number; duplicates?: number[] };

function ImportSheet({ open, kind, onClose, onDone }: { open: boolean; kind: CardKind; onClose: () => void; onDone: (msg: string) => void }) {
  const [csv, setCsv] = useState("");
  const [report, setReport] = useState<ImportReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(dryRun: boolean) {
    setBusy(true);
    setError(null);
    const r = await adminFetch<ImportReport>("/api/admin/cards/import", { method: "POST", body: { kind, csv, dryRun } });
    setBusy(false);
    if (r.ok) {
      if (!dryRun) {
        const d = r.data;
        onDone(`${d.created} cartas importadas${d.duplicates?.length ? `, ${d.duplicates.length} já existiam` : ""}.`);
        setCsv("");
        setReport(null);
      } else setReport(r.data);
    } else if (r.body && typeof r.body === "object" && "errors" in r.body) setReport(r.body as ImportReport);
    else setError(r.message);
  }

  return (
    <Sheet open={open} title={`Importar ${kind === "black" ? "perguntas" : "respostas"}`} onClose={onClose}>
      <p className="text-sm text-texto-2">Uma carta por linha: texto; nível (1 a 4); categoria (opcional). Funciona com o CSV salvo pelo Excel ou pelo Google Planilhas.</p>
      <label htmlFor="csv-file" className="text-sm font-extrabold">
        Arquivo .csv
        <input
          id="csv-file"
          type="file"
          accept=".csv,text/csv,text/plain"
          className="mt-1 block w-full text-sm"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (file) {
              setCsv(await file.text());
              setReport(null);
            }
          }}
        />
      </label>
      <Label htmlFor="csv-text">Ou cole aqui</Label>
      <textarea
        id="csv-text"
        value={csv}
        onChange={(e) => {
          setCsv(e.target.value);
          setReport(null);
        }}
        rows={6}
        placeholder={"Um boleto vencido.;1;cotidiano\nUm pombo com crise.;2;absurdo"}
        className="rounded-xl border-2 border-breu-3 bg-breu p-3 font-mono text-sm text-texto focus:border-amarelo focus:outline-none"
      />
      {report && (
        <div className="grid gap-1 rounded-xl bg-breu p-3 text-sm" role="status">
          <p className="font-bold">{report.valid} linha(s) válida(s).</p>
          {report.errors.length > 0 && (
            <>
              <p className="font-bold text-vermelho">Corrija estas linhas antes de importar:</p>
              <ul className="grid gap-0.5">
                {report.errors.slice(0, 20).map((e) => (
                  <li key={e.line}>
                    Linha {e.line}: {e.message}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
      {error && <Hint error>{error}</Hint>}
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" disabled={busy || !csv.trim()} onClick={() => run(true)}>
          Conferir
        </Button>
        <Button disabled={busy || !csv.trim() || !report || report.errors.length > 0 || report.valid === 0} onClick={() => run(false)}>
          Importar
        </Button>
      </div>
    </Sheet>
  );
}
