"use client";

import { useCallback, useEffect, useState } from "react";
import { useMe } from "@/components/admin/AdminShell";
import { PageTitle, Panel, Select, SmallButton } from "@/components/admin/ui";
import { Button } from "@/components/ui/Button";
import { Hint, Label, TextInput } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import type { Role } from "@/lib/admin-schemas";
import { adminFetch } from "@/lib/client/admin-api";

type Member = { id: string; email: string | null; roles: Role[]; since: string };
const ROLE_LABEL: Record<Role, string> = { admin: "Administrador", editor: "Editor de conteúdo" };

export default function StaffPage() {
  const me = useMe();
  const [members, setMembers] = useState<Member[] | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("editor");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await adminFetch<Member[]>("/api/admin/staff");
    if (r.ok) setMembers(r.data);
    else setError(r.message);
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(t);
  }, [load]);

  if (!me.isAdmin) return <p role="alert">Só administradores gerenciam a equipe.</p>;

  async function grant(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const r = await adminFetch("/api/admin/staff", { method: "POST", body: { email: email.trim(), role } });
    if (!r.ok) return setError(r.message);
    setEmail("");
    setNotice("Acesso concedido.");
    void load();
  }

  async function revoke(m: Member, r: Role) {
    const res = await adminFetch(`/api/admin/staff/${m.id}?role=${r}`, { method: "DELETE" });
    if (res.ok) {
      setNotice("Acesso removido.");
      void load();
    } else setError(res.message);
  }

  return (
    <>
      <PageTitle title="EQUIPE" description="Editores cuidam das cartas e categorias. Administradores também apagam cartas e gerenciam a equipe." />
      <Panel title="Dar acesso">
        <form className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end" onSubmit={grant}>
          <div className="grid gap-1.5">
            <Label htmlFor="staff-email">E-mail</Label>
            <TextInput id="staff-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <Select id="staff-role" label="Papel" value={role} onChange={(v) => setRole(v as Role)} options={[{ value: "editor", label: ROLE_LABEL.editor }, { value: "admin", label: ROLE_LABEL.admin }]} />
          <Button type="submit" disabled={!email.includes("@")}>
            Dar acesso
          </Button>
        </form>
        <Hint>A pessoa precisa ter uma conta criada no Supabase (Authentication &gt; Users). Ela entra no painel pelo link enviado ao e-mail.</Hint>
        {error && <Hint error>{error}</Hint>}
      </Panel>
      <ul className="grid gap-2">
        {members?.map((m) => (
          <li key={m.id} className="flex flex-wrap items-center gap-3 rounded-2xl bg-breu-2 p-3">
            <div className="min-w-0 flex-1">
              <p className="font-extrabold break-all">
                {m.email ?? "(sem e-mail)"}
                {m.id === me.userId && <span className="font-normal text-texto-2"> (você)</span>}
              </p>
              <p className="text-xs text-texto-2">Desde {new Date(m.since).toLocaleDateString("pt-BR")}</p>
            </div>
            {m.roles.map((r) => (
              <span key={r} className="flex items-center gap-1.5 rounded-lg bg-breu px-2 py-1 text-xs font-bold">
                {ROLE_LABEL[r]}
                {!(r === "admin" && m.id === me.userId) && (
                  <SmallButton className="!min-h-7 !px-2" onClick={() => revoke(m, r)} aria-label={`Remover ${ROLE_LABEL[r]} de ${m.email}`}>
                    ×
                  </SmallButton>
                )}
              </span>
            ))}
          </li>
        ))}
      </ul>
      <Notice message={notice} tone="ok" onClose={() => setNotice(null)} />
    </>
  );
}
