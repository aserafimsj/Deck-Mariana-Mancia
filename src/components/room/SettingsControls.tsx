"use client";

import { useState } from "react";
import { Chips, Label, Stepper } from "@/components/ui/Field";
import { ANSWER_TIMER_OPTIONS, HUMOR_LEVELS, LIMITS, type HumorLevel, type RoomSettings } from "@/lib/game-config";
import { Level4Warning } from "./Level4Warning";

/** Regras da sala. Usado ao criar a sala e na sala de espera (só o anfitrião). */
export function SettingsControls({ value, onChange }: { value: RoomSettings; onChange: (patch: Partial<RoomSettings>) => void }) {
  const [askLevel4, setAskLevel4] = useState(false);
  return (
    <div className="grid gap-4">
      <div className="grid gap-1.5">
        <Label>Pontos para vencer</Label>
        <Stepper label="pontos para vencer" value={value.pointsToWin} min={LIMITS.pointsToWin.min} max={LIMITS.pointsToWin.max} onChange={(v) => onChange({ pointsToWin: v })} />
      </div>
      <div className="grid gap-1.5">
        <Label>Tempo para responder</Label>
        <Chips
          label="Tempo para responder"
          value={value.answerSeconds}
          onChange={(v) => onChange({ answerSeconds: v })}
          options={ANSWER_TIMER_OPTIONS.map((s) => ({ value: s, label: s === 0 ? "Sem tempo" : `${s} s` }))}
        />
      </div>
      <div className="grid gap-1.5">
        <Label>Nível de humor</Label>
        <Chips<HumorLevel>
          label="Nível de humor"
          value={value.humorLevel}
          danger={4}
          onChange={(v) => (v === 4 ? setAskLevel4(true) : onChange({ humorLevel: v }))}
          options={HUMOR_LEVELS.map((l) => ({ value: l.level, label: l.name }))}
        />
        <p className="text-[13px] text-texto-2">{HUMOR_LEVELS[value.humorLevel - 1].description}</p>
      </div>
      <div className="grid gap-1.5">
        <Label>Máximo de jogadores</Label>
        <Chips label="Máximo de jogadores" value={value.maxPlayers} onChange={(v) => onChange({ maxPlayers: v })} options={[4, 6, 8, 10].map((n) => ({ value: n, label: String(n) }))} />
      </div>
      <Level4Warning
        open={askLevel4}
        confirmLabel="Ativar Sem Filtro"
        onConfirm={() => {
          setAskLevel4(false);
          onChange({ humorLevel: 4 });
        }}
        onCancel={() => setAskLevel4(false)}
      />
    </div>
  );
}
