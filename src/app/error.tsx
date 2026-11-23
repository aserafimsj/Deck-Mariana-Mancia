"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { Screen } from "@/components/ui/ScreenHeader";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <Screen className="justify-center gap-5 text-center">
      <h1 className="font-display text-2xl text-amarelo">DEU RUIM AQUI</h1>
      <p className="text-texto-2">Algo quebrou do nosso lado. Tenta de novo; se continuar, volta ao menu e entra na sala pelo código. Seu lugar fica guardado.</p>
      {error.digest && <p className="text-xs text-texto-2">Código do erro: {error.digest}</p>}
      <div className="grid gap-2.5">
        <Button block onClick={reset}>
          Tentar de novo
        </Button>
        <Link href="/" className="font-extrabold text-ciano underline underline-offset-4">
          Voltar ao menu
        </Link>
      </div>
    </Screen>
  );
}
