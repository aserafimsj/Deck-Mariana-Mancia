"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { SettingsControls } from "@/components/room/SettingsControls";
import { StickyActions } from "@/components/ui/StickyActions";
import { Button } from "@/components/ui/Button";
import { Hint, Label, TextInput } from "@/components/ui/Field";
import { useNicknameField } from "@/hooks/useDefaultNickname";
import { api } from "@/lib/client/api";
import { DEFAULT_ROOM_SETTINGS, type RoomSettings } from "@/lib/game-config";
import { NICKNAME_MAX, nicknameSchema } from "@/lib/nickname";

export function CreateRoomForm() {
  const router = useRouter();
  const quick = useSearchParams().get("rapido") === "1";
  const nickname = useNicknameField();
  const [settings, setSettings] = useState<RoomSettings>(DEFAULT_ROOM_SETTINGS);
  const [showRules, setShowRules] = useState(!quick);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = nicknameSchema.safeParse(nickname.value);
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Apelido inválido.");
    setBusy(true);
    setError(null);
    const r = await api.createRoom(parsed.data, settings);
    if (!r.ok) {
      setBusy(false);
      return setError(r.error.message);
    }
    nickname.remember(parsed.data);
    router.push(`/s/${r.data.code}`);
  }

  return (
    <form onSubmit={submit} className="flex flex-1 flex-col gap-5" noValidate>
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
          placeholder="Como a galera te chama"
          aria-invalid={error !== null}
          aria-describedby="nick-hint"
          autoFocus
        />
        <Hint id="nick-hint" error={error !== null}>
          {error ?? `Até ${NICKNAME_MAX} caracteres. É assim que a galera vai te ver.`}
        </Hint>
      </div>

      {showRules ? (
        <SettingsControls value={settings} onChange={(patch) => setSettings((s) => ({ ...s, ...patch }))} />
      ) : (
        <button type="button" onClick={() => setShowRules(true)} className="self-start text-sm font-extrabold text-ciano underline underline-offset-4">
          Regras padrão: {settings.pointsToWin} pontos, {settings.answerSeconds} s, Picante. Mudar
        </button>
      )}

      <StickyActions>
        <Button type="submit" block disabled={busy}>
          {busy ? "Criando..." : "Criar sala"}
        </Button>
      </StickyActions>
    </form>
  );
}
