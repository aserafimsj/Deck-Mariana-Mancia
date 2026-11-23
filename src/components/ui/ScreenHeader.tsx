import Link from "next/link";

/** Cabeçalho das telas internas: voltar + título. */
export function ScreenHeader({ title, backHref = "/" }: { title: string; backHref?: string }) {
  return (
    <header className="flex items-center justify-between gap-3">
      <Link
        href={backHref}
        aria-label="Voltar"
        className="grid size-11 place-items-center rounded-xl bg-breu-2 text-xl font-black text-texto"
      >
        ←
      </Link>
      <h1 className="font-display text-[22px] text-papel">{title}</h1>
      <span className="size-11" aria-hidden="true" />
    </header>
  );
}

/** Contêiner de tela mobile-first com respiro para as áreas seguras do celular. */
export function Screen({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <main
      className={`mx-auto flex min-h-dvh w-full max-w-md flex-col gap-5 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] ${className}`}
    >
      {children}
    </main>
  );
}
