import type pg from "pg";
import type { GameEvent, GameState, RoundSummary } from "@/engine";

/**
 * Grava o histórico (partidas, rodadas, respostas, placar final) a partir dos eventos do motor.
 * Roda depois que a jogada já foi gravada: se falhar, a partida continua normalmente
 * e só as estatísticas ficam incompletas.
 */
export async function recordHistory(pool: pg.Pool, roomId: string, state: GameState, events: GameEvent[]): Promise<void> {
  const relevant = events.filter((e) => ["game_started", "round_won", "round_cancelled", "game_over"].includes(e.type));
  if (relevant.length === 0) return;

  const client = await pool.connect();
  try {
    await client.query("begin");
    for (const e of relevant) {
      if (e.type === "game_started") {
        await client.query(
          `insert into public.games (room_id, settings_snapshot, humor_level, started_at)
           values ($1, $2, $3, to_timestamp($4::double precision / 1000))`,
          [roomId, JSON.stringify(state.settings), state.settings.humorLevel, state.startedAt ?? Date.now()],
        );
      } else if (e.type === "round_won" || e.type === "round_cancelled") {
        await recordRound(client, roomId, e.summary);
      } else if (e.type === "game_over") {
        await recordGameOver(client, roomId, state);
      }
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function openGameId(client: pg.PoolClient, roomId: string): Promise<string | null> {
  const { rows } = await client.query<{ id: string }>(
    "select id from public.games where room_id = $1 and ended_at is null order by started_at desc limit 1",
    [roomId],
  );
  return rows[0]?.id ?? null;
}

async function recordRound(client: pg.PoolClient, roomId: string, summary: RoundSummary) {
  const gameId = await openGameId(client, roomId);
  if (!gameId) return;
  const round = await client.query<{ id: string }>(
    `insert into public.rounds (game_id, number, judge_id, black_card_id, end_reason, ended_at)
     values ($1, $2, $3, $4, $5, now())
     on conflict (game_id, number) do nothing
     returning id`,
    [gameId, summary.number, summary.judgeId, summary.blackCard.id, summary.endReason],
  );
  const roundId = round.rows[0]?.id;
  if (!roundId) return; // já gravada (reprocessamento)

  for (const [i, sub] of summary.submissions.entries()) {
    const inserted = await client.query<{ id: string }>(
      `insert into public.submissions (round_id, player_id, white_card_ids, reveal_order, submitted_at)
       values ($1, $2, $3, $4, now())
       returning id`,
      [roundId, sub.playerId, sub.cards.map((c) => c.id), i],
    );
    if (sub.playerId === summary.winnerId) {
      await client.query("update public.rounds set winning_submission_id = $1 where id = $2", [inserted.rows[0]!.id, roundId]);
    }
  }
}

async function recordGameOver(client: pg.PoolClient, roomId: string, state: GameState) {
  const gameId = await openGameId(client, roomId);
  if (!gameId) return;
  const reachedPoints = Object.values(state.players).some((p) => p.score >= state.settings.pointsToWin);
  await client.query(
    `update public.games set ended_at = now(), winner_id = $2, total_rounds = $3, end_reason = $4 where id = $1`,
    [gameId, state.winners[0] ?? null, state.roundsPlayed, reachedPoints ? "points" : "rounds"],
  );
  const ranked = Object.values(state.players)
    .filter((p) => p.status !== "kicked")
    .sort((a, b) => b.score - a.score || b.roundsWon - a.roundsWon);
  for (const p of ranked) {
    const rank = 1 + ranked.filter((q) => q.score > p.score).length;
    await client.query(
      `insert into public.game_players (game_id, user_id, nickname, score, rounds_won, final_rank)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (game_id, user_id) do update set score = excluded.score, rounds_won = excluded.rounds_won, final_rank = excluded.final_rank`,
      [gameId, p.id, p.nickname, p.score, p.roundsWon, rank],
    );
  }
}
