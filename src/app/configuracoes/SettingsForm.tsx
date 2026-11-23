"use client";

import { useState } from "react";
import { useLocalSettings } from "@/hooks/useLocalSettings";
import { NICKNAME_MAX, nicknameSchema } from "@/lib/nickname";
import type { LocalSettings } from "@/lib/local-settings";

type ToggleKey = "sound" | "vibration" | "reducedMotion";

const TOGGLES: { key: ToggleKey; label: string }[] = [
  { key: "sound", label: "Sons" },
  { key: "vibration", label: "Vibração" },
  { key: "reducedMotion", label: "Menos animação" },
];

export function SettingsForm() {
  const { settings, update } = useLocalSettings();

  return (
    <div className="grid gap-3">
      {TOGGLES.map(({ key, label }) => (
        <Toggle key={key} id={`set-${key}`} label={label} checked={settings[key]} onChange={(v) => update({ [key]: v } as Partial<LocalSettings>)} />
      ))}
      <NicknameField saved={settings.defaultNickname} onSave={(v) => update({ defaultNickname: v })} />
    </div>
  );
}

function Toggle({ id, label, checked, onChange }: { id: string; label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[14px] bg-breu-2 p-3.5 font-extrabold">
      <span id={`${id}-label`}>{label}</span>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={`${id}-label`}
        onClick={() => onChange(!checked)}
        className={`relative h-8 w-14 shrink-0 rounded-full transition-colors ${checked ? "bg-amarelo" : "bg-breu-3"}`}
      >
        <span className={`absolute top-1 left-1 size-6 rounded-full transition-transform ${checked ? "translate-x-6 bg-tinta" : "bg-texto-2"}`} />
      </button>
    </div>
  );
}

function NicknameField({ saved, onSave }: { saved: string; onSave: (v: string) => boolean }) {
  // Enquanto a pessoa não digita, o campo mostra o valor salvo (que só chega depois da hidratação).
  const [draft, setDraft] = useState<string | null>(null);
  const value = draft ?? saved;
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  function save() {
    if (value.trim() === "") {
      onSave("");
      setDraft(null);
      setMessage({ kind: "ok", text: "Apelido padrão removido." });
      return;
    }
    const result = nicknameSchema.safeParse(value);
    if (!result.success) {
      setMessage({ kind: "err", text: result.error.issues[0]?.message ?? "Apelido inválido." });
      return;
    }
    const stored = onSave(result.data);
    setDraft(stored ? null : result.data);
    setMessage(stored ? { kind: "ok", text: "Salvo." } : { kind: "err", text: "Este navegador não deixou salvar. Tenta sair do modo anônimo." });
  }

  return (
    <form
      className="grid gap-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <label htmlFor="set-nickname" className="text-[13px] font-extrabold tracking-[.06em] text-texto-2 uppercase">
        Apelido padrão
      </label>
      <div className="flex gap-2">
        <input
          id="set-nickname"
          value={value}
          maxLength={NICKNAME_MAX + 8}
          autoComplete="nickname"
          onChange={(e) => {
            setDraft(e.target.value);
            setMessage(null);
          }}
          aria-invalid={message?.kind === "err"}
          aria-describedby="set-nickname-msg"
          className="min-h-[54px] w-full min-w-0 rounded-xl border-2 border-breu-3 bg-breu px-3.5 text-lg font-bold text-texto focus:border-amarelo focus:outline-none"
        />
        <button type="submit" className="min-h-[54px] shrink-0 rounded-xl bg-breu-3 px-4 font-display text-sm text-texto">
          Salvar
        </button>
      </div>
      <p id="set-nickname-msg" role="status" className={`text-[13px] ${message?.kind === "err" ? "font-bold text-vermelho" : "text-texto-2"}`}>
        {message?.text ?? `Até ${NICKNAME_MAX} caracteres. Preenche sozinho quando você criar ou entrar numa sala.`}
      </p>
    </form>
  );
}
