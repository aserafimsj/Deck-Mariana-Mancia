"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Level4Warning } from "@/components/room/Level4Warning";
import { StickyActions } from "@/components/ui/StickyActions";
import { Button } from "@/components/ui/Button";
import { Hint, Label, TextInput } from "@/components/ui/Field";
import { useNicknameField } from "@/hooks/useDefaultNickname";
import { api } from "@/lib/client/api";
import { NICKNAME_MAX, nicknameSchema } from "@/lib/nickname";
import { isValidRoomCode, normalizeRoomCode, ROOM_CODE_LENGTH } from "@/lib/room-code";

export function JoinRoomForm() {
  const router = useRouter();
  const nickname = useNicknameField();
  const params = useSearchParams();
  const [code, setCode] = useState(() => normalizeRoomCode(params.get("codigo") ?? "").slice(0, ROOM_CODE_LENGTH));
  const [error, setError] = useState<{ field: "nick" | "code"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [askLevel4, setAskLevel4] = useState(false);

  async function join(acceptedLevel4?: boolean) {
    const parsed = nicknameSchema.safeParse(nickname.value);
    if (!parsed.success) return setError({ field: "nick", text: parsed.error.issues[0]?.message ?? "Apelido inválido." });
    if (!isValidRoomCode(code)) return setError({ field: "code", text: `O código tem ${ROOM_CODE_LENGTH} caracteres.` });
    setBusy(true);
    setError(null);
    const r = await api.join(code, parsed.data, acceptedLevel4);
    setBusy(false);
    if (r.ok) {
      nickname.remember(parsed.data);
      return router.push(`/s/${code}`);
    }
    if (r.error.code === "LEVEL4_NOT_ACCEPTED") return setAskLevel4(true);
    setError({ field: r.error.code === "ROOM_NOT_FOUND" ? "code" : "nick", text: r.error.message });
  }

  return (
    <form
      className="flex flex-1 flex-col gap-5"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void join();
      }}
    >
      <div className="grid gap-1.5">
        <Label htmlFor="nick">Seu apelido</Label>
        <TextInput
          id="nick"
          value={nickname.value}
          onChange={(e) => {
            nickname.setValue(e.target.value);
            setError(null);
          }}
          maxLength={NICKNAME_MAX + 8}
          autoComplete="nickname"
          aria-invalid={error?.field === "nick"}
          aria-describedby="nick-hint"
        />
        <Hint id="nick-hint" error={error?.field === "nick"}>
          {error?.field === "nick" ? error.text : `Até ${NICKNAME_MAX} caracteres.`}
        </Hint>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="code">Código da sala</Label>
        <TextInput
          id="code"
          value={code}
          onChange={(e) => {
            setCode(normalizeRoomCode(e.target.value).slice(0, ROOM_CODE_LENGTH));
            setError(null);
          }}
          inputMode="text"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          placeholder="KZ7PA"
          className="text-center font-display text-3xl tracking-[.3em] text-amarelo"
          aria-invalid={error?.field === "code"}
          aria-describedby="code-hint"
        />
        <Hint id="code-hint" error={error?.field === "code"}>
          {error?.field === "code" ? error.text : "Pede o código para quem criou a sala. Ou abre o link que te mandaram."}
        </Hint>
      </div>
      <StickyActions>
        <Button type="submit" block disabled={busy}>
          {busy ? "Entrando..." : "Entrar na sala"}
        </Button>
      </StickyActions>
      <Level4Warning
        open={askLevel4}
        confirmLabel="Topo, entrar"
        onConfirm={() => {
          setAskLevel4(false);
          void join(true);
        }}
        onCancel={() => setAskLevel4(false)}
      />
    </form>
  );
}
