import type { ReactNode } from "react";

/**
 * Barra de ações presa ao rodapé: o botão principal fica sempre ao alcance do polegar,
 * mesmo em celulares pequenos ou quando a tela tem rolagem.
 */
export function StickyActions({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-0 z-10 -mx-4 mt-auto grid gap-2 bg-[linear-gradient(to_top,var(--color-breu)_70%,transparent)] px-4 pt-5 pb-[max(.75rem,env(safe-area-inset-bottom))]">
      {children}
    </div>
  );
}
