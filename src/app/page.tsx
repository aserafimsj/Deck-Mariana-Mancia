import { Logo } from "@/components/brand/Logo";
import { GameCard } from "@/components/game/GameCard";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Screen } from "@/components/ui/ScreenHeader";

export default function HomePage() {
  return (
    <Screen>
      <div className="mt-8 grid gap-3 text-center">
        <Logo as="h1" />
        <p className="font-bold text-texto-2">O jogo das respostas que você não devia dar.</p>
      </div>

      <div className="relative mx-auto h-48 w-full max-w-[280px]" aria-hidden="true">
        <div className="absolute top-0 left-2 w-[120px] -rotate-[10deg]">
          <GameCard kind="question" text="Qual é o segredo para conquistar alguém?" size="sm" />
        </div>
        <div className="absolute top-2 right-2 w-[120px] rotate-[8deg]">
          <GameCard kind="answer" text="Um boleto vencido." size="sm" />
        </div>
      </div>

      <nav className="mt-auto grid gap-3" aria-label="Menu principal">
        {/* As salas chegam na Etapa 5 (multiplayer). Os botões ficam visíveis, mas desligados, para não fingir que funcionam. */}
        <Button block disabled aria-describedby="em-breve">
          Jogar
        </Button>
        <Button block variant="secondary" disabled aria-describedby="em-breve">
          Criar sala
        </Button>
        <Button block variant="secondary" disabled aria-describedby="em-breve">
          Entrar em uma sala
        </Button>
        <p id="em-breve" className="text-center text-sm text-texto-2">
          As salas abrem na próxima etapa do desenvolvimento.
        </p>
        <div className="grid grid-cols-2 gap-2.5">
          <ButtonLink href="/como-jogar" variant="ghost">
            Como jogar
          </ButtonLink>
          <ButtonLink href="/configuracoes" variant="ghost">
            Configurações
          </ButtonLink>
        </div>
      </nav>
    </Screen>
  );
}
