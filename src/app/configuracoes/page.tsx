import type { Metadata } from "next";
import { Screen, ScreenHeader } from "@/components/ui/ScreenHeader";
import { InstallApp } from "./InstallApp";
import { SettingsForm } from "./SettingsForm";

export const metadata: Metadata = { title: "Configurações" };

export default function SettingsPage() {
  return (
    <Screen>
      <ScreenHeader title="AJUSTES" />
      <SettingsForm />
      <InstallApp />
      <p className="mt-auto text-center text-sm text-texto-2">Essas preferências ficam salvas só neste aparelho.</p>
    </Screen>
  );
}
