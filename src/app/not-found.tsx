import Link from "next/link";
import { ButtonLink } from "@/components/ui/Button";
import { Screen } from "@/components/ui/ScreenHeader";

export default function NotFound() {
  return (
    <Screen className="justify-center gap-5 text-center">
      <p className="font-display text-6xl text-rosa [text-shadow:4px_4px_0_#000]">404</p>
      <h1 className="font-display text-2xl text-papel">ESSA PÁGINA NÃO EXISTE</h1>
      <p className="text-texto-2">Ou existiu e alguém jogou fora. Se você veio por um convite, confere o código da sala.</p>
      <div className="grid gap-2.5">
        <ButtonLink href="/entrar" block>
          Entrar em uma sala
        </ButtonLink>
        <Link href="/" className="font-extrabold text-ciano underline underline-offset-4">
          Voltar ao menu
        </Link>
      </div>
    </Screen>
  );
}
