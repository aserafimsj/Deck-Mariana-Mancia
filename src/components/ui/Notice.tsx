"use client";

import { useEffect } from "react";

/** Aviso curto no rodapé (erros de ação, confirmações). Some sozinho. */
export function Notice({ message, tone = "error", onClose }: { message: string | null; tone?: "error" | "ok"; onClose: () => void }) {
  useEffect(() => {
    if (!message) return;
    const t = window.setTimeout(onClose, 4500);
    return () => window.clearTimeout(t);
  }, [message, onClose]);
  if (!message) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] z-50 flex justify-center px-4">
      <p
        role="alert"
        className={`pointer-events-auto max-w-md rounded-xl bg-papel px-4 py-3 font-extrabold text-tinta animate-[pop-in_.2s_ease-out] ${tone === "error" ? "shadow-[4px_4px_0_var(--color-vermelho)]" : "shadow-[4px_4px_0_var(--color-rosa)]"}`}
        onClick={onClose}
      >
        {message}
      </p>
    </div>
  );
}
