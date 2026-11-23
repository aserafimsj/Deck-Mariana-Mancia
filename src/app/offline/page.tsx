import type { Metadata } from "next";
import { Logo } from "@/components/brand/Logo";
import { Screen } from "@/components/ui/ScreenHeader";
import { RetryButton } from "./RetryButton";

export const metadata: Metadata = { title: "Sem internet" };

export default function OfflinePage() {
  return (
    <Screen className="justify-center gap-6 text-center">
      <Logo className="text-[clamp(1.75rem,9vw,2.75rem)]" />
      <h1 className="font-display text-2xl text-amarelo">SEM INTERNET</h1>
      <p className="text-texto-2">O jogo precisa de conexão para falar com a sala. Quando a internet voltar, é só tentar de novo: seu lugar na sala fica guardado.</p>
      <RetryButton />
    </Screen>
  );
}
