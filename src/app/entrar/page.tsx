import type { Metadata } from "next";
import { Suspense } from "react";
import { Screen, ScreenHeader } from "@/components/ui/ScreenHeader";
import { JoinRoomForm } from "./JoinRoomForm";

export const metadata: Metadata = { title: "Entrar em uma sala" };

export default function JoinRoomPage() {
  return (
    <Screen>
      <ScreenHeader title="ENTRAR" />
      <Suspense>
        <JoinRoomForm />
      </Suspense>
    </Screen>
  );
}
