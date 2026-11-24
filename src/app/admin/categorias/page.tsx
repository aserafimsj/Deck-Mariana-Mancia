"use client";

import { useCallback, useEffect, useState } from "react";
import { Empty, PageTitle, Panel, SmallButton } from "@/components/admin/ui";
import { Button } from "@/components/ui/Button";
import { Hint, Label, TextInput } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { adminFetch } from "@/lib/client/admin-api";

type Category = { slug: string; name: string; color: string | null; isActive: boolean; black: number; white: number };

/** "Comida de Rua" -> "comida-de-rua" */
function toSlug(name: string) {
  return name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

export default function CategoriesPage() {
  const [items, setItems] = useState<Category[] | null>(null);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#3FE0CF");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await adminFetch<Category[]>("/api/admin/categories");
    if (r.ok) setItems(r.data);
    else setError(r.message);
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(t);
  }, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const r = await adminFetch("/api/admin/categories", { method: "POST", body: { slug: toSlug(name), name: name.trim(), color: color.toUpperCase(), isActive: true } });
    if (!r.ok) return setError(r.message);
    setName("");
    setNotice("Categoria criada.");
    void load();
  }

  async function update(slug: string, body: Partial<Category>) {
    const r = await adminFetch(`/api/admin/categories/${slug}`, { method: "PATCH", body });
    if (r.ok) void load();
    else setError(r.message);
  }

  return (
    <>
      <PageTitle title="CATEGORIAS" description="Quem cria a sala pode escolher categorias. Categoria desativada some da escolha, mas as cartas dela continuam no jogo quando a sala usa todas as categorias." />
      <Panel title="Nova categoria">
        <form className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end" onSubmit={create}>
          <div className="grid gap-1.5">
            <Label htmlFor="cat-name">Nome</Label>
            <TextInput id="cat-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} aria-describedby="cat-hint" />
            <Hint id="cat-hint">Identificador: {toSlug(name) || "—"}</Hint>
          </div>
          <label htmlFor="cat-color" className="grid gap-1.5 text-[13px] font-extrabold tracking-[.06em] text-texto-2 uppercase">
            Cor
            <input id="cat-color" type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-[54px] w-20 rounded-xl border-2 border-breu-3 bg-breu" />
          </label>
          <Button type="submit" disabled={toSlug(name).length < 2}>
            Criar
          </Button>
        </form>
        {error && <Hint error>{error}</Hint>}
      </Panel>
      {!items ? (
        <p role="status" className="text-texto-2">
          Carregando...
        </p>
      ) : items.length === 0 ? (
        <Empty>Nenhuma categoria.</Empty>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {items.map((c) => (
            <li key={c.slug} className="flex items-center gap-3 rounded-2xl bg-breu-2 p-3">
              <span className="size-5 shrink-0 rounded-full border-2 border-black" style={{ background: c.color ?? "transparent" }} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className={`font-extrabold ${c.isActive ? "" : "text-texto-2"}`}>{c.name}</p>
                <p className="text-xs text-texto-2">
                  {c.black} perguntas · {c.white} respostas{c.isActive ? "" : " · desativada"}
                </p>
              </div>
              <RenameButton category={c} onRename={(n) => update(c.slug, { name: n })} />
              <SmallButton onClick={() => update(c.slug, { isActive: !c.isActive })} aria-label={`${c.isActive ? "Desativar" : "Ativar"} ${c.name}`}>
                {c.isActive ? "Desativar" : "Ativar"}
              </SmallButton>
            </li>
          ))}
        </ul>
      )}
      <Notice message={notice} tone="ok" onClose={() => setNotice(null)} />
    </>
  );
}

/** Renomear na própria linha: o botão vira um campo com Salvar. */
function RenameButton({ category, onRename }: { category: Category; onRename: (name: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(category.name);
  if (!editing) {
    return (
      <SmallButton onClick={() => setEditing(true)} aria-label={`Renomear ${category.name}`}>
        Renomear
      </SmallButton>
    );
  }
  return (
    <form
      className="flex gap-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim().length >= 2) onRename(value.trim());
        setEditing(false);
      }}
    >
      <input
        aria-label={`Novo nome para ${category.name}`}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        maxLength={40}
        autoFocus
        className="min-h-9 w-36 rounded-lg border-2 border-breu-3 bg-breu px-2 text-sm font-bold text-texto focus:border-amarelo focus:outline-none"
      />
      <SmallButton type="submit" tone="primary">
        Salvar
      </SmallButton>
    </form>
  );
}
