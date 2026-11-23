"use client";

import { useEffect, useState } from "react";
import type { PlayerView } from "@/engine";
import { play, vibrate, type Sound } from "@/lib/client/feedback";
import { describeMoment, detectMoments, type Moment } from "@/lib/moments";
import { useLocalSettings } from "./useLocalSettings";

export type Banner = { title: string; subtitle?: string; tone: "amarelo" | "ciano" | "rosa" };

const SOUND: Partial<Record<Moment["type"], Sound>> = {
  all_answered: "chime",
  answer_revealed: "flip",
  round_won: "badumtss",
  game_over: "fanfare",
  player_joined: "pop",
  player_left: "tap",
  you_are_host: "chime",
};

function bannerFor(moments: Moment[]): Banner | null {
  const find = <T extends Moment["type"]>(t: T) => moments.find((m) => m.type === t) as Extract<Moment, { type: T }> | undefined;
  const won = find("round_won");
  if (won?.youWon) return { title: "SUA RESPOSTA VENCEU!", subtitle: "+1 ponto", tone: "rosa" };
  const round = find("round_started");
  if (round) return round.youAreJudge ? { title: `RODADA ${round.number}`, subtitle: "Você é o juiz", tone: "ciano" } : { title: `RODADA ${round.number}`, subtitle: `Juiz: ${round.judgeName}`, tone: "amarelo" };
  if (find("all_answered")) return { title: "TODO MUNDO RESPONDEU!", subtitle: "Hora da revelação", tone: "amarelo" };
  if (find("you_are_host")) return { title: "VOCÊ É O ANFITRIÃO", subtitle: "Agora você comanda a sala", tone: "amarelo" };
  return null;
}

/**
 * Transforma as mudanças da partida em sensação de jogo: som, vibração, aviso grande,
 * confete e anúncio para leitores de tela. Respeita as Configurações (som, vibração, menos animação).
 */
export function useGameEffects(view: PlayerView | null) {
  const { settings } = useLocalSettings();
  const [last, setLast] = useState<PlayerView | null>(null);
  const [feed, setFeed] = useState<{ seq: number; moments: Moment[] }>({ seq: 0, moments: [] });
  const [dismissed, setDismissed] = useState(0);

  // Comparação durante a renderização (padrão do React para estado derivado de props).
  if (view && view !== last) {
    const moments = detectMoments(last, view);
    setLast(view);
    if (moments.length) setFeed((f) => ({ seq: f.seq + 1, moments }));
  }

  useEffect(() => {
    if (feed.seq === 0) return;
    const me = feed.moments;
    if (settings.sound) {
      const round = me.find((m) => m.type === "round_started");
      if (round && round.type === "round_started") play(round.youAreJudge ? "chime" : "pop");
      for (const m of me) {
        const s = SOUND[m.type];
        if (s) play(s);
      }
    }
    if (settings.vibration) {
      if (me.some((m) => (m.type === "round_won" && m.youWon) || (m.type === "game_over" && m.youWon))) vibrate([80, 40, 140]);
      else if (me.some((m) => m.type === "round_started" && m.youAreJudge)) vibrate([40, 60, 40]);
    }
    const t = window.setTimeout(() => setDismissed(feed.seq), 1700);
    return () => window.clearTimeout(t);
    // Só reage a um novo lote de momentos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feed]);

  const celebrate = feed.moments.some((m) => (m.type === "round_won" && m.youWon) || m.type === "game_over");
  return {
    banner: feed.seq !== dismissed ? bannerFor(feed.moments) : null,
    confettiKey: celebrate ? feed.seq : null,
    announcement: feed.moments.map(describeMoment).join(" "),
  };
}
