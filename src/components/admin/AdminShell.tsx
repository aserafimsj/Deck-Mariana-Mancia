"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Hint, Label, TextInput } from "@/components/ui/Field";
import type { Role } from "@/lib/admin-schemas";
import { adminFetch } from "@/lib/client/admin-api";
import { DEV_AUTH, devAdminLogin, sendAdminMagicLink, signOut } from "@/lib/client/auth";

type Me = { userId: string; roles: Role[]; isAdmin: boolean };
const MeContext = createContext<Me | null>(null);

/** Papéis de quem está usando o painel (para mostrar ou esconder ações). */
export function useMe(): Me {
  const me = useContext(MeContext);
  if (!me) throw new Error("useMe fora do painel");
  return me;
}

const NAV = [
  { href: "/admin", label: "Painel" },
  { href: "/admin/cartas", label: "Cartas" },
  { href: "/admin/categorias", label: "Categorias" },
  { href: "/admin/partidas", label: "Partidas" },
  { href: "/admin/equipe", label: "Equipe", adminOnly: true },
];

type State = { kind: "loading" } | { kind: "login"; reason?: string } | { kind: "forbidden"; message: string } | { kind: "ok"; me: Me } | { kind: "error"; message: string };

/**
 * Moldura do painel: confere no servidor quem está logado e com qual papel.
 * Sem sessão → tela de login. Sessão sem papel de equipe → acesso restrito.
 * (A proteção de verdade é no servidor: cada rota da API confere o papel de novo.)
 */
export function AdminShell({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const pathname = usePathname();

  const check = useCallback(async () => {
    const r = await adminFetch<Me>("/api/admin/me");
    if (r.ok) setState({ kind: "ok", me: r.data });
    else if (r.status === 401) setState({ kind: "login" });
    else if (r.status === 403) setState({ kind: "forbidden", message: r.message });
    else setState({ kind: "error", message: r.message });
  }, []);

  useEffect(() => {
    // O link do e-mail volta com ?code=...; o cliente do Supabase troca por sessão e então conferimos.
    const t = window.setTimeout(() => void check(), 0);
    return () => window.clearTimeout(t);
  }, [check]);

  if (state.kind === "loading") return <Centered>Carregando o painel...</Centered>;
  if (state.kind === "error") return <Centered>{state.message}</Centered>;
  if (state.kind === "login" || state.kind === "forbidden") {
    return <AdminLogin forbidden={state.kind === "forbidden" ? state.message : undefined} onLoggedIn={check} />;
  }

  const me = state.me;
  return (
    <MeContext.Provider value={me}>
      <div className="min-h-dvh pb-10">
        <header className="sticky top-0 z-20 border-b-2 border-breu-3 bg-breu/95 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
            <Link href="/admin" className="font-display text-lg text-papel">
              SCRAG<span className="text-amarelo">B</span>ADUM! <span className="text-xs text-texto-2">painel</span>
            </Link>
            <nav aria-label="Seções do painel" className="-mx-1 flex flex-1 gap-1 overflow-x-auto">
              {NAV.filter((n) => !n.adminOnly || me.isAdmin).map((n) => {
                const active = n.href === "/admin" ? pathname === "/admin" : pathname.startsWith(n.href);
                return (
                  <Link
                    key={n.href}
                    href={n.href}
                    aria-current={active ? "page" : undefined}
                    className={`rounded-lg px-3 py-2 text-sm font-extrabold whitespace-nowrap ${active ? "bg-amarelo text-tinta" : "text-texto hover:bg-breu-2"}`}
                  >
                    {n.label}
                  </Link>
                );
              })}
            </nav>
            <span className="hidden text-xs text-texto-2 sm:inline">{me.isAdmin ? "Administrador" : "Editor"}</span>
            <button
              type="button"
              onClick={async () => {
                await signOut();
                setState({ kind: "login" });
              }}
              className="rounded-lg px-3 py-2 text-sm font-extrabold text-texto-2 hover:bg-breu-2"
            >
              Sair
            </button>
          </div>
        </header>
        <main className="mx-auto grid max-w-6xl gap-6 px-4 pt-6">{children}</main>
      </div>
    </MeContext.Provider>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-dvh place-items-center px-4 text-center">
      <p className="font-display text-xl text-texto-2" role="status">
        {children}
      </p>
    </div>
  );
}

function AdminLogin({ forbidden, onLoggedIn }: { forbidden?: string; onLoggedIn: () => void }) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <div className="mx-auto grid min-h-dvh max-w-sm content-center gap-5 px-4">
      <h1 className="font-display text-2xl text-papel">PAINEL DA EQUIPE</h1>
      {forbidden && (
        <p role="alert" className="rounded-xl bg-breu-2 p-3 text-sm font-bold text-vermelho">
          {forbidden} Entre com outra conta.
        </p>
      )}
      {DEV_AUTH ? (
        <>
          <p className="text-sm text-texto-2">Ambiente de desenvolvimento: entre como administrador de teste.</p>
          <Button
            block
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await devAdminLogin();
                onLoggedIn();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Entrar como admin de teste
          </Button>
        </>
      ) : sent ? (
        <p className="rounded-xl bg-breu-2 p-4 font-bold">Enviamos um link para {email}. Abra o e-mail neste mesmo aparelho e toque no link para entrar.</p>
      ) : (
        <form
          className="grid gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            try {
              await sendAdminMagicLink(email.trim());
              setSent(true);
            } catch (err) {
              setError((err as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Label htmlFor="admin-email">E-mail da equipe</Label>
          <TextInput id="admin-email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Hint>Só contas cadastradas pela equipe. Você recebe um link para entrar, sem senha.</Hint>
          <Button type="submit" block disabled={busy || !email}>
            {busy ? "Enviando..." : "Receber link de acesso"}
          </Button>
        </form>
      )}
      {error && <Hint error>{error}</Hint>}
      <Link href="/" className="text-sm font-extrabold text-ciano underline underline-offset-4">
        Voltar ao jogo
      </Link>
    </div>
  );
}
