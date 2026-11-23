import type { Metadata, Viewport } from "next";
import "@fontsource/bungee/latin-400.css";
import "@fontsource-variable/archivo/wdth.css";
import "./globals.css";
import { MotionPreference } from "@/components/MotionPreference";
import { ServiceWorker } from "@/components/ServiceWorker";

export const metadata: Metadata = {
  title: {
    default: "Scragbadum!",
    template: "%s · Scragbadum!",
  },
  description: "O jogo das respostas que você não devia dar. Party game de cartas para jogar com os amigos, direto no celular.",
  applicationName: "Scragbadum!",
  appleWebApp: { capable: true, title: "Scragbadum!", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#15101a",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className="h-full">
      <body className="min-h-full">
        <MotionPreference />
        <ServiceWorker />
        {children}
      </body>
    </html>
  );
}
