"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Empty, Level, PageTitle, Panel, SmallButton, StatTile, WinRate } from "@/components/admin/ui";
import { adminFetch } from "@/lib/client/admin-api";

type Card = { id: string; text: string; humorLevel: number; plays: number; wins: number };
type Stats = {
  gamesToday: number;
  gamesWeek: number;
  gamesPerRoom: number | null;
  completionRate: number | null;
  avgMinutes: number | null;
  playersWeek: number;
  roundsWeek: number;
  roomsNow: number;
  playingNow: number;
  activeBlack: number;
  activeWhite: number;
  topCards: Card[];
  neverWinning: Card[];
};

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await adminFetch<Stats>("/api/admin/stats");
    if (r.ok) setStats(r.data);
    else setError(r.message);
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(t);
  }, [load]);

  async function archive(id: string) {
    const r = await adminFetch(`/api/admin/cards/white/${id}`, { method: "PATCH", body: { status: "archived" } });
    if (r.ok) void load();
    else setError(r.message);
  }

  if (error) return <p role="alert" className="font-bold text-vermelho">{error}</p>;
  if (!stats) return <p role="status" className="text-texto-2">Carregando números...</p>;

  return (
    <>
      <PageTitle title="PAINEL" description="Como o jogo está sendo jogado e quais cartas fazem a galera rir. Números dos últimos 7 dias, exceto onde indicado." />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Salas agora" value={stats.roomsNow} hint={`${stats.playingNow} em partida`} />
        <StatTile label="Partidas hoje" value={stats.gamesToday} />
        <StatTile label="Partidas (7 dias)" value={stats.gamesWeek} hint={stats.completionRate === null ? "sem partidas ainda" : `${stats.completionRate}% terminaram`} />
        <StatTile label="Partidas por sala" value={stats.gamesPerRoom === null ? "—" : stats.gamesPerRoom.toLocaleString("pt-BR")} hint="meta: acima de 1,5 (jogaram de novo)" />
        <StatTile label="Jogadores (7 dias)" value={stats.playersWeek} hint={`${stats.roundsWeek} rodadas`} />
        <StatTile label="Duração média" value={stats.avgMinutes === null ? "—" : `${stats.avgMinutes} min`} hint="partidas que terminaram" />
        <StatTile label="Perguntas ativas" value={stats.activeBlack} />
        <StatTile label="Respostas ativas" value={stats.activeWhite} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Respostas que mais vencem" aside={<Link href="/admin/cartas" className="text-sm font-extrabold text-ciano underline underline-offset-4">Ver todas</Link>}>
          {stats.topCards.length === 0 ? (
            <Empty>Aparece aqui quando as cartas tiverem pelo menos 3 jogadas.</Empty>
          ) : (
            <CardList cards={stats.topCards} />
          )}
        </Panel>
        <Panel title="Jogadas 5+ vezes e nunca venceram">
          {stats.neverWinning.length === 0 ? (
            <Empty>Nenhuma carta encalhada por enquanto.</Empty>
          ) : (
            <CardList cards={stats.neverWinning} action={(c) => <SmallButton onClick={() => archive(c.id)}>Arquivar</SmallButton>} />
          )}
        </Panel>
      </div>
    </>
  );
}

function CardList({ cards, action }: { cards: Card[]; action?: (c: Card) => React.ReactNode }) {
  return (
    <ol className="grid gap-2">
      {cards.map((c) => (
        <li key={c.id} className="flex items-center gap-3 rounded-xl bg-breu px-3 py-2">
          <Level level={c.humorLevel} />
          <span className="min-w-0 flex-1 text-sm font-bold">{c.text}</span>
          <span className="text-xs">
            <WinRate plays={c.plays} wins={c.wins} />
          </span>
          {action?.(c)}
        </li>
      ))}
    </ol>
  );
}
