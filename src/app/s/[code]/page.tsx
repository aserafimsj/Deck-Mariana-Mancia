import type { Metadata } from "next";
import { Suspense } from "react";
import { RoomScreen } from "@/components/room/RoomScreen";
import { Screen } from "@/components/ui/ScreenHeader";

export const metadata: Metadata = {
  title: "Sala",
  description: "Vem jogar Scragbadum! comigo. É só entrar com um apelido.",
};

/** A sala é uma rota só: a tela muda conforme a fase (espera, jogo, resultado). */
export default function RoomPage() {
  return (
    <Suspense
      fallback={
        <Screen className="items-center justify-center">
          <p className="font-display text-xl text-texto-2 animate-pulse" role="status">
            ENTRANDO NA SALA...
          </p>
        </Screen>
      }
    >
      <RoomScreen />
    </Suspense>
  );
}
