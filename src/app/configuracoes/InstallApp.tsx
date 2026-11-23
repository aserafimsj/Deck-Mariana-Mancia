"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

/** Instalar o jogo na tela inicial do celular (Android/desktop: botão; iPhone: instruções). */
export function InstallApp() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [installed, setInstalled] = useState(false);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallPrompt);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    // Detecção do ambiente só existe no navegador; atualiza depois da montagem.
    queueMicrotask(() => {
      setInstalled(standalone);
      setIos(isIos);
    });
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed) return <p className="rounded-[14px] bg-breu-2 p-3.5 text-sm font-bold text-texto-2">O app já está instalado neste aparelho.</p>;

  return (
    <section className="grid gap-2 rounded-[14px] bg-breu-2 p-3.5" aria-labelledby="install-title">
      <h2 id="install-title" className="font-extrabold">
        Instalar o app
      </h2>
      {prompt ? (
        <>
          <p className="text-sm text-texto-2">Fica na tela inicial e abre em tela cheia, como um app.</p>
          <Button
            block
            variant="secondary"
            onClick={async () => {
              await prompt.prompt();
              const choice = await prompt.userChoice;
              if (choice.outcome === "accepted") setInstalled(true);
              setPrompt(null);
            }}
          >
            Instalar
          </Button>
        </>
      ) : ios ? (
        <p className="text-sm text-texto-2">No iPhone: toque em Compartilhar e depois em &quot;Adicionar à Tela de Início&quot;.</p>
      ) : (
        <p className="text-sm text-texto-2">No menu do navegador, procure &quot;Instalar app&quot; ou &quot;Adicionar à tela inicial&quot;.</p>
      )}
    </section>
  );
}
