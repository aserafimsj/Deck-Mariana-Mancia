"use client";

import type { ReactNode } from "react";
import { LevelBadge } from "@/components/game/LevelBadge";
import type { HumorLevel } from "@/lib/game-config";

export function PageTitle({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="grid gap-1">
        <h1 className="font-display text-2xl text-papel">{title}</h1>
        {description && <p className="max-w-[65ch] text-sm text-texto-2">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({ title, children, aside }: { title?: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="grid min-w-0 gap-3 rounded-2xl bg-breu-2 p-4" aria-label={title}>
      {(title || aside) && (
        <div className="flex items-center justify-between gap-2">
          {title && <h2 className="text-xs font-black tracking-[.1em] text-texto-2 uppercase">{title}</h2>}
          {aside}
        </div>
      )}
      {children}
    </section>
  );
}

export function StatTile({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="grid gap-1 rounded-2xl bg-breu-2 p-4">
      <span className="text-[11px] font-black tracking-[.08em] text-texto-2 uppercase">{label}</span>
      <span className="font-display text-3xl text-amarelo tabular-nums">{value}</span>
      {hint && <span className="text-xs text-texto-2">{hint}</span>}
    </div>
  );
}

export function SmallButton({ children, tone = "default", ...props }: React.ComponentProps<"button"> & { tone?: "default" | "primary" | "danger" }) {
  const cls = {
    default: "bg-breu-3 text-texto",
    primary: "bg-amarelo text-tinta",
    danger: "bg-vermelho text-tinta",
  }[tone];
  return (
    <button type="button" {...props} className={`min-h-9 rounded-lg px-3 text-sm font-extrabold whitespace-nowrap disabled:opacity-40 ${cls} ${props.className ?? ""}`}>
      {children}
    </button>
  );
}

export function Select({ label, value, onChange, options, id }: { label: string; id: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <label htmlFor={id} className="grid gap-1 text-xs font-extrabold tracking-[.06em] text-texto-2 uppercase">
      {label}
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-10 rounded-lg border-2 border-breu-3 bg-breu px-2 text-sm font-bold tracking-normal text-texto normal-case focus:border-amarelo focus:outline-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Level({ level }: { level: number }) {
  return <LevelBadge level={level as HumorLevel} className="!px-2 !py-1 !text-[11px]" />;
}

/** Taxa de vitória, legível mesmo com poucas jogadas. */
export function WinRate({ plays, wins }: { plays: number; wins: number }) {
  if (plays === 0) return <span className="whitespace-nowrap text-texto-2">nunca jogada</span>;
  return (
    <span className="whitespace-nowrap tabular-nums">
      {wins}/{plays} <span className="text-texto-2">({Math.round((wins / plays) * 100)}%)</span>
    </span>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border-2 border-dashed border-breu-3 p-6 text-center text-sm text-texto-2">{children}</p>;
}
