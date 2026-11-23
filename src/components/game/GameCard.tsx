import { splitCardText } from "@/lib/card-text";
import type { HumorLevel } from "@/lib/game-config";

type Props = {
  kind: "question" | "answer";
  text: string;
  /** Pontinhos de nível no rodapé (só carta pergunta). */
  level?: HumorLevel;
  /** Selo "ESCOLHA 2". */
  pick?: 1 | 2;
  selected?: boolean;
  winner?: boolean;
  /** Tamanho do texto: "md" para mão e destaque, "sm" para miniaturas. */
  size?: "sm" | "md" | "lg";
  className?: string;
};

const TEXT_SIZE = { sm: "text-xs", md: "text-[17px]", lg: "text-xl" } as const;

/** Carta do jogo. Pergunta = fundo preto com sombra rosa; resposta = papel com sombra preta. */
export function GameCard({ kind, text, level, pick = 1, selected = false, winner = false, size = "md", className = "" }: Props) {
  const isQuestion = kind === "question";
  const surface = isQuestion
    ? "bg-carta-preta text-papel border-2 border-breu-3 shadow-rosa"
    : "bg-papel text-tinta shadow-dura";
  const state = selected ? "-translate-y-3 rotate-0 outline-3 outline-offset-2 outline-amarelo shadow-amarelo" : "";

  return (
    <div
      className={`relative flex aspect-[5/7] max-w-full flex-col justify-between gap-2.5 rounded-carta px-4 pt-[18px] pb-3.5 font-extrabold leading-[1.18] [font-stretch:92%] select-none ${surface} ${state} ${className}`}
    >
      {isQuestion && pick === 2 && (
        <span className="absolute -top-2.5 right-3 rotate-[4deg] rounded-lg bg-amarelo px-2 py-1 font-display text-[11px] text-tinta shadow-[2px_2px_0_#000]">
          ESCOLHA 2
        </span>
      )}
      <p className={`${TEXT_SIZE[size]} [overflow-wrap:anywhere]`}>
        {splitCardText(text).map((part, i) =>
          part.type === "blank" ? <span key={i} className="card-blank">
              <span className="sr-only">lacuna</span>
            </span> : <span key={i}>{part.value}</span>,
        )}
      </p>
      <div className={`flex items-center justify-between gap-2 font-display text-[9px] tracking-[.04em] ${isQuestion ? "text-texto-2" : "text-[#6b6175]"}`}>
        <span>SCRAGBADUM!</span>
        {isQuestion && level && (
          <span className="inline-flex gap-[3px]" role="img" aria-label={`Nível de humor ${level}`}>
            {[1, 2, 3, 4].map((n) => (
              <i key={n} className={`size-[7px] rounded-full bg-current ${n <= level ? "opacity-100" : "opacity-25"}`} />
            ))}
          </span>
        )}
      </div>
      {winner && (
        <span className="absolute top-[38%] left-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-[14deg] rounded-[10px] border-4 border-[#d61f6e] bg-papel/85 px-2.5 py-0.5 font-display text-[26px] text-[#d61f6e]">
          VENCEU!
        </span>
      )}
    </div>
  );
}
