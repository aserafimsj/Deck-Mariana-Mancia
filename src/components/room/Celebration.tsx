"use client";

import type { Banner } from "@/hooks/useGameEffects";

const TONE = { amarelo: "text-amarelo", ciano: "text-ciano", rosa: "text-rosa" } as const;

/** Aviso grande e rápido no meio da tela (rodada nova, você é o juiz, sua resposta venceu). */
export function BannerOverlay({ banner }: { banner: Banner | null }) {
  if (!banner) return null;
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-30 grid place-items-center bg-breu/85 px-6 animate-[pop-in_.18s_ease-out]">
      <div className="grid -rotate-3 gap-2 text-center">
        <p className={`font-display text-[clamp(2rem,10vw,3rem)] leading-none [text-shadow:4px_4px_0_#000] ${TONE[banner.tone]}`}>{banner.title}</p>
        {banner.subtitle && <p className="font-display text-xl text-papel">{banner.subtitle.toUpperCase()}</p>}
      </div>
    </div>
  );
}

const COLORS = ["var(--color-amarelo)", "var(--color-rosa)", "var(--color-ciano)", "var(--color-papel)"];

/** Confete em CSS. Posições pseudoaleatórias a partir da semente (sem Math.random na renderização). */
export function Confetti({ seed }: { seed: number }) {
  const pieces = Array.from({ length: 48 }, (_, i) => {
    const r = (n: number) => ((Math.sin(seed * 97 + i * 13.37 + n) + 1) / 2) % 1;
    return { left: r(1) * 100, delay: r(2) * 0.5, rotate: r(3) * 180, duration: 1.4 + r(4) * 0.9, color: COLORS[i % COLORS.length]! };
  });
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-40 overflow-hidden">
      {pieces.map((p, i) => (
        <i
          key={i}
          className="absolute -top-5 block h-4 w-2.5 rounded-[2px] animate-[confetti-fall_var(--d)_ease-in_forwards]"
          style={{ left: `${p.left}%`, background: p.color, animationDelay: `${p.delay}s`, transform: `rotate(${p.rotate}deg)`, ["--d" as string]: `${p.duration}s` }}
        />
      ))}
    </div>
  );
}
