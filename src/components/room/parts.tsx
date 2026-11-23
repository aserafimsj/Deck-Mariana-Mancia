"use client";

import type { PlayerView } from "@/engine";

const AVATAR_COLORS = ["bg-amarelo", "bg-ciano", "bg-rosa", "bg-papel", "bg-vermelho"];

export function Avatar({ name, seat }: { name: string; seat: number }) {
  return (
    <span aria-hidden="true" className={`grid size-[38px] shrink-0 place-items-center rounded-full border-2 border-black font-display text-[15px] text-tinta ${AVATAR_COLORS[seat % AVATAR_COLORS.length]}`}>
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

export function Tag({ tone, children }: { tone: "host" | "judge" | "ok" | "off"; children: React.ReactNode }) {
  const cls = {
    host: "bg-amarelo text-tinta",
    judge: "bg-ciano text-tinta",
    ok: "border-[1.5px] border-ciano text-ciano",
    off: "bg-breu-3 text-texto-2",
  }[tone];
  return <span className={`shrink-0 rounded-full px-2 py-[3px] text-[11px] font-black tracking-[.06em] whitespace-nowrap uppercase ${cls}`}>{children}</span>;
}

type Player = PlayerView["players"][number];

/** Lista de jogadores com papéis e estado. `onKick` aparece só para o anfitrião. */
export function PlayerList({ players, meId, showSubmitted, onKick }: { players: Player[]; meId: string | null; showSubmitted?: boolean; onKick?: (p: Player) => void }) {
  return (
    <ul className="grid gap-2" aria-label="Jogadores">
      {players.map((p) => (
        <li key={p.id} className={`flex min-w-0 items-center gap-3 rounded-xl bg-breu-2 px-3 py-2.5 ${p.online ? "" : "opacity-50"}`}>
          <Avatar name={p.nickname} seat={p.seat} />
          <span className="min-w-0 flex-1 truncate font-extrabold">
            {p.nickname}
            {p.id === meId && <span className="font-normal text-texto-2"> (você)</span>}
          </span>
          {p.isHost && <Tag tone="host">Anfitrião</Tag>}
          {p.isJudge && <Tag tone="judge">Juiz</Tag>}
          {showSubmitted && p.hasSubmitted && <Tag tone="ok">Respondeu ✓</Tag>}
          {!p.online && <Tag tone="off">Caiu da rede</Tag>}
          {onKick && p.id !== meId && (
            <button type="button" onClick={() => onKick(p)} aria-label={`Remover ${p.nickname}`} className="grid size-9 shrink-0 place-items-center rounded-lg bg-breu-3 text-lg font-black text-texto-2">
              ×
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

export function Scoreboard({ players, highlight, pointsToWin }: { players: Player[]; highlight?: string | null; pointsToWin: number }) {
  const sorted = [...players].sort((a, b) => b.score - a.score || a.seat - b.seat);
  const top = sorted[0]?.score ?? 0;
  return (
    <ol className="grid gap-2" aria-label="Placar">
      {sorted.map((p) => (
        <li key={p.id} className={`flex items-center gap-2.5 rounded-xl bg-breu-2 px-3 py-2 ${p.score === top && top > 0 ? "shadow-[inset_0_0_0_2px_var(--color-amarelo)]" : ""}`}>
          <Avatar name={p.nickname} seat={p.seat} />
          <span className="min-w-0 flex-1 truncate font-extrabold">{p.nickname}</span>
          <span className={`font-display text-lg text-amarelo tabular-nums ${p.id === highlight ? "animate-[bump_.6s_ease]" : ""}`}>
            <span aria-hidden="true">{p.score}</span>
            <span className="sr-only">
              {p.score} de {pointsToWin} pontos
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}

/** Anel de tempo: amarelo, e vermelho nos últimos 10 segundos. */
export function TimerRing({ seconds, total }: { seconds: number | null; total: number }) {
  if (seconds === null) return null;
  const hot = seconds <= 10;
  const C = 169.6;
  return (
    <div className="relative size-16 shrink-0" role="timer" aria-label={`${seconds} segundos restantes`}>
      <svg viewBox="0 0 64 64" className="size-full -rotate-90">
        <circle cx="32" cy="32" r="27" fill="none" stroke="var(--color-breu-3)" strokeWidth="6" />
        <circle
          cx="32"
          cy="32"
          r="27"
          fill="none"
          stroke={hot ? "var(--color-vermelho)" : "var(--color-amarelo)"}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - Math.min(1, seconds / total))}
          style={{ transition: "stroke-dashoffset .25s linear" }}
        />
      </svg>
      <span className={`absolute inset-0 grid place-items-center font-display text-[17px] ${hot ? "text-vermelho" : ""}`}>{seconds}</span>
    </div>
  );
}

export function Progress({ done, total }: { done: number; total: number }) {
  return (
    <div className="flex gap-1.5" aria-hidden="true">
      {Array.from({ length: total }, (_, i) => (
        <i key={i} className={`h-2 w-6 rounded-full ${i < done ? "bg-ciano" : "bg-breu-3"}`} />
      ))}
    </div>
  );
}
