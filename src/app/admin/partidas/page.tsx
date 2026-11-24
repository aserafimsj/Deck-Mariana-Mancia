"use client";

import { useEffect, useState } from "react";
import { Empty, Level, PageTitle } from "@/components/admin/ui";
import { adminFetch } from "@/lib/client/admin-api";

type Game = { id: string; code: string; humorLevel: number; startedAt: string; endedAt: string | null; endReason: string | null; rounds: number; players: number; winner: string | null };

const REASON: Record<string, string> = { points: "Terminou (pontos)", rounds: "Terminou (rodadas)", abandoned: "Abandonada" };

function duration(g: Game) {
  if (!g.endedAt) return "em andamento";
  const min = Math.round((new Date(g.endedAt).getTime() - new Date(g.startedAt).getTime()) / 60000);
  return `${min} min`;
}

export default function GamesPage() {
  const [games, setGames] = useState<Game[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void adminFetch<Game[]>("/api/admin/games").then((r) => (r.ok ? setGames(r.data) : setError(r.message)));
  }, []);

  return (
    <>
      <PageTitle title="PARTIDAS" description="As 50 partidas mais recentes. Os apelidos dos jogadores não aparecem aqui, só o do vencedor." />
      {error && <p role="alert" className="font-bold text-vermelho">{error}</p>}
      {!games ? (
        !error && <p role="status" className="text-texto-2">Carregando...</p>
      ) : games.length === 0 ? (
        <Empty>Nenhuma partida ainda.</Empty>
      ) : (
        <div className="overflow-x-auto rounded-2xl bg-breu-2">
          <table className="w-full min-w-[680px] text-left text-sm">
            <caption className="sr-only">Partidas recentes</caption>
            <thead className="text-[11px] font-black tracking-[.08em] text-texto-2 uppercase">
              <tr className="border-b-2 border-breu-3">
                <th className="px-3 py-3">Início</th>
                <th className="px-3 py-3">Sala</th>
                <th className="px-3 py-3">Nível</th>
                <th className="px-3 py-3">Jogadores</th>
                <th className="px-3 py-3">Rodadas</th>
                <th className="px-3 py-3">Duração</th>
                <th className="px-3 py-3">Situação</th>
                <th className="px-3 py-3">Vencedor</th>
              </tr>
            </thead>
            <tbody>
              {games.map((g) => (
                <tr key={g.id} className="border-b border-breu-3 last:border-0">
                  <td className="px-3 py-2.5 tabular-nums">{new Date(g.startedAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</td>
                  <td className="px-3 py-2.5 font-display tracking-[.08em]">{g.code}</td>
                  <td className="px-3 py-2.5">
                    <Level level={g.humorLevel} />
                  </td>
                  <td className="px-3 py-2.5 tabular-nums">{g.players}</td>
                  <td className="px-3 py-2.5 tabular-nums">{g.rounds}</td>
                  <td className="px-3 py-2.5">{duration(g)}</td>
                  <td className="px-3 py-2.5">{g.endReason ? REASON[g.endReason] : "Jogando"}</td>
                  <td className="px-3 py-2.5 font-bold">{g.winner ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
