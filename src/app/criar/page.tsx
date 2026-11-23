import type { Metadata } from "next";
import { Suspense } from "react";
import { Screen, ScreenHeader } from "@/components/ui/ScreenHeader";
import { CreateRoomForm } from "./CreateRoomForm";

export const metadata: Metadata = { title: "Criar sala" };

export default function CreateRoomPage() {
  return (
    <Screen>
      <ScreenHeader title="CRIAR SALA" />
      {/* O formulário lê ?rapido da URL no navegador. */}
      <Suspense>
        <CreateRoomForm />
      </Suspense>
    </Screen>
  );
}
