"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** Painel que sobe da parte de baixo da tela (mais fácil de alcançar com o polegar). */
export function Sheet({ open, title, tone = "default", onClose, children }: { open: boolean; title: string; tone?: "default" | "danger"; onClose?: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    ref.current?.querySelector<HTMLElement>("input, button")?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/75" onClick={onClose}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className={`grid max-h-[92dvh] w-full max-w-md gap-3 overflow-y-auto rounded-t-[22px] border-t-4 bg-breu-2 px-4 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] animate-[sheet-up_.22s_ease-out] ${tone === "danger" ? "border-vermelho" : "border-amarelo"}`}
      >
        <h2 className={`font-display text-[22px] ${tone === "danger" ? "text-vermelho" : "text-papel"}`}>{title}</h2>
        {children}
      </div>
    </div>
  );
}
