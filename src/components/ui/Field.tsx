import type { ComponentProps, ReactNode } from "react";

export function Label({ htmlFor, children }: { htmlFor?: string; children: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="text-[13px] font-extrabold tracking-[.06em] text-texto-2 uppercase">
      {children}
    </label>
  );
}

export function TextInput({ className = "", ...props }: ComponentProps<"input">) {
  return (
    <input
      className={`min-h-[54px] w-full min-w-0 rounded-xl border-2 border-breu-3 bg-breu px-3.5 text-lg font-bold text-texto placeholder:text-texto-2/60 focus:border-amarelo focus:outline-none ${className}`}
      {...props}
    />
  );
}

export function Hint({ id, error, children }: { id?: string; error?: boolean; children: ReactNode }) {
  return (
    <p id={id} className={`text-[13px] ${error ? "font-bold text-vermelho" : "text-texto-2"}`} role={error ? "alert" : undefined}>
      {children}
    </p>
  );
}

export function Chips<T extends string | number>({
  label,
  options,
  value,
  onChange,
  danger,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  danger?: T;
}) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={label}>
      {options.map((o) => {
        const on = o.value === value;
        const red = danger === o.value;
        return (
          <button
            key={String(o.value)}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.value)}
            className={`min-h-11 rounded-xl border-2 px-3.5 text-sm font-extrabold transition-colors ${
              on ? (red ? "border-vermelho bg-vermelho text-tinta" : "border-amarelo bg-amarelo text-tinta") : "border-breu-3 bg-breu-2 text-texto"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Stepper({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-2.5" role="group" aria-label={label}>
      <button type="button" aria-label={`Diminuir ${label}`} disabled={value <= min} onClick={() => onChange(value - 1)} className="size-11 rounded-xl bg-breu-3 text-2xl font-black text-texto disabled:opacity-40">
        −
      </button>
      <output className="min-w-[2ch] text-center font-display text-2xl text-amarelo" aria-live="polite">
        {value}
      </output>
      <button type="button" aria-label={`Aumentar ${label}`} disabled={value >= max} onClick={() => onChange(value + 1)} className="size-11 rounded-xl bg-breu-3 text-2xl font-black text-texto disabled:opacity-40">
        +
      </button>
    </div>
  );
}
