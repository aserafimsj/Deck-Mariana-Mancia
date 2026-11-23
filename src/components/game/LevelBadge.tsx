import { humorLevelInfo, type HumorLevel } from "@/lib/game-config";

const STYLE: Record<HumorLevel, string> = {
  1: "bg-ciano text-tinta",
  2: "bg-amarelo text-tinta",
  3: "bg-rosa text-tinta",
  4: "text-tinta bg-[repeating-linear-gradient(-45deg,var(--color-vermelho)_0_10px,#ff7a70_10px_20px)]",
};

export function LevelBadge({ level, className = "" }: { level: HumorLevel; className?: string }) {
  return (
    <span className={`inline-block rounded-[10px] px-2.5 py-1.5 font-display text-[13px] whitespace-nowrap ${STYLE[level]} ${className}`}>
      {humorLevelInfo(level).name.toUpperCase()}
    </span>
  );
}
