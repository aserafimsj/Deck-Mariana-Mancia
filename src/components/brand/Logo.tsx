const LETTERS = "SCRAGBADUM".split("");

// Rotação de cada letra: a bagunça é fixa, para o logo ser sempre igual.
const TILT = [-5, 3, -4, 4, -3, 6, -4, 3, -5, 4];

type Props = { className?: string; as?: "h1" | "div" };

/** Logo tipográfico. O "B" fica em amarelo (o "ba-dum" da piada). */
export function Logo({ className = "text-[clamp(2rem,10vw,3.25rem)]", as: Tag = "div" }: Props) {
  return (
    <Tag aria-label="Scragbadum!" role={Tag === "div" ? "img" : undefined} className={`flex flex-nowrap justify-center font-display leading-[.95] ${className}`}>
      {LETTERS.map((letter, i) => (
        <span
          key={i}
          aria-hidden="true"
          className={i === 5 ? "text-amarelo [text-shadow:3px_3px_0_#000]" : "text-papel [text-shadow:3px_3px_0_var(--color-rosa)]"}
          style={{ display: "inline-block", transform: `rotate(${TILT[i]}deg)` }}
        >
          {letter}
        </span>
      ))}
      <span aria-hidden="true" className="text-amarelo [text-shadow:3px_3px_0_#000]" style={{ display: "inline-block", transform: "rotate(10deg)" }}>
        !
      </span>
    </Tag>
  );
}
