import type { Metadata } from "next";
import { LevelBadge } from "@/components/game/LevelBadge";
import { ButtonLink } from "@/components/ui/Button";
import { Screen, ScreenHeader } from "@/components/ui/ScreenHeader";
import { DEFAULT_ROOM_SETTINGS, HUMOR_LEVELS } from "@/lib/game-config";

export const metadata: Metadata = { title: "Como jogar" };

const STEPS = [
  { title: "Alguém vira juiz", text: "A cada rodada, uma pessoa diferente é o juiz e revela a carta pergunta." },
  { title: "Todo mundo responde", text: "Escolha da sua mão a carta resposta mais absurda para completar a frase." },
  { title: "O juiz escolhe", text: "As respostas aparecem sem nome. O juiz lê em voz alta e escolhe a melhor." },
  {
    title: `Quem fizer ${DEFAULT_ROOM_SETTINGS.pointsToWin} pontos vence`,
    text: "Cada vitória vale 1 ponto. Quem cria a sala pode mudar isso.",
  },
];

export default function HowToPlayPage() {
  return (
    <Screen>
      <ScreenHeader title="COMO JOGAR" />
      <ol className="grid gap-3">
        {STEPS.map((step, i) => (
          <li key={step.title} className="grid grid-cols-[48px_minmax(0,1fr)] items-start gap-3.5 rounded-[14px] bg-breu-2 p-3.5">
            <span className="font-display text-[28px] leading-none text-amarelo">{i + 1}</span>
            <div>
              <h2 className="font-extrabold">{step.title}</h2>
              <p className="text-sm text-texto-2">{step.text}</p>
            </div>
          </li>
        ))}
      </ol>

      <section className="grid gap-3" aria-labelledby="niveis">
        <h2 id="niveis" className="text-xs font-extrabold tracking-[.1em] text-texto-2 uppercase">
          Níveis de humor
        </h2>
        <ul className="grid gap-2.5">
          {HUMOR_LEVELS.map((lv) => (
            <li key={lv.level} className="grid gap-1.5 rounded-[14px] bg-breu-2 p-3.5">
              <LevelBadge level={lv.level} className="justify-self-start" />
              <p className="text-sm text-texto-2">{lv.description}</p>
            </li>
          ))}
        </ul>
      </section>

      <ButtonLink href="/" block className="mt-auto">
        Entendi, bora
      </ButtonLink>
    </Screen>
  );
}
