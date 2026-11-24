import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ADMIN_URL, addPlayer, as, createRoom, createTestDb, createUser, expectPgError, nextCode, type TestDb } from "./helpers";

describe.skipIf(!ADMIN_URL)("banco: integridade e transições", () => {
  let db: TestDb;
  let host: string, guest: string, third: string;

  beforeAll(async () => {
    db = await createTestDb();
    [host, guest, third] = await Promise.all([createUser(db.pool), createUser(db.pool), createUser(db.pool)]);
  });

  afterAll(async () => {
    await db?.drop();
  });

  describe("seed", () => {
    it("carrega o baralho base com cartas de 1 e 2 lacunas", async () => {
      const { rows } = await db.pool.query(
        "select (select count(*)::int from public.black_cards) as black, (select count(*)::int from public.white_cards) as white, (select count(*)::int from public.black_cards where pick = 2) as pick2",
      );
      expect(rows[0].black).toBeGreaterThanOrEqual(20);
      expect(rows[0].white).toBeGreaterThanOrEqual(60);
      expect(rows[0].pick2).toBeGreaterThanOrEqual(2);
    });

    it("cartas de 2 escolhas têm exatamente 2 lacunas", async () => {
      const { rows } = await db.pool.query("select text from public.black_cards where pick = 2");
      for (const r of rows) expect((r.text.match(/___/g) ?? []).length, r.text).toBe(2);
    });

    it("rodar o seed de novo não duplica nada", async () => {
      const before = await db.pool.query("select count(*)::int as n from public.white_cards");
      const { readFileSync } = await import("node:fs");
      await db.pool.query(readFileSync(new URL("../../supabase/seed.sql", import.meta.url), "utf8"));
      const after = await db.pool.query("select count(*)::int as n from public.white_cards");
      expect(after.rows[0].n).toBe(before.rows[0].n);
    });
  });

  describe("salas e jogadores", () => {
    it("recusa código com caracteres ambíguos", async () => {
      await expectPgError(db.pool.query("insert into public.rooms (code, host_id) values ('AB0CD', $1)", [host]), /rooms_code_check/);
    });

    it("código não se repete entre salas abertas, mas pode voltar depois de fechada", async () => {
      const code = nextCode();
      await db.pool.query("insert into public.rooms (code, host_id) values ($1, $2)", [code, host]);
      await expectPgError(db.pool.query("insert into public.rooms (code, host_id) values ($1, $2)", [code, host]), /rooms_code_open_uidx/);
      await db.pool.query("update public.rooms set status = 'closed', closed_at = now() where code = $1", [code]);
      await db.pool.query("insert into public.rooms (code, host_id) values ($1, $2)", [code, host]);
    });

    it("sala pública nunca pode ser Sem Filtro", async () => {
      await expectPgError(createRoom(db.pool, host, { visibility: "public", humorLevel: 4 }), /rooms_public_never_level4/);
    });

    it("apelido é único na sala sem diferenciar maiúsculas", async () => {
      const room = await createRoom(db.pool, host);
      await addPlayer(db.pool, room, host, "Ana", 0);
      await expectPgError(addPlayer(db.pool, room, guest, "ANA", 1), /room_players_nickname_uidx/);
    });

    it("apelido de quem saiu fica livre", async () => {
      const room = await createRoom(db.pool, host);
      await addPlayer(db.pool, room, host, "Ana", 0, "left");
      await addPlayer(db.pool, room, guest, "ana", 1);
    });

    it("fecha salas inativas", async () => {
      const room = await createRoom(db.pool, host);
      await db.pool.query("update public.rooms set last_activity_at = now() - interval '3 hours' where id = $1", [room]);
      const { rows } = await db.pool.query("select public.close_inactive_rooms() as n");
      expect(rows[0].n).toBeGreaterThanOrEqual(1);
      const r = await db.pool.query("select status, closed_at is not null as closed from public.rooms where id = $1", [room]);
      expect(r.rows[0]).toEqual({ status: "closed", closed: true });
    });
  });

  describe("gravação atômica do estado (commit_game_transition)", () => {
    async function commit(roomId: string, expected: number, actionId = randomUUID(), state: object = { n: expected + 1 }) {
      return as(db.pool, "service_role", null, async (c) => {
        const { rows } = await c.query("select * from public.commit_game_transition($1, $2, $3, $4, $5, 'TEST', '{}'::jsonb)", [
          roomId,
          expected,
          JSON.stringify(state),
          host,
          actionId,
        ]);
        await c.query("commit"); // `as` faz rollback; aqui queremos persistir
        return rows[0] as { out_status: string; out_version: number };
      });
    }

    it("cria o estado inicial na versão 1 e avança a versão a cada ação", async () => {
      const room = await createRoom(db.pool, host);
      expect(await commit(room, 0)).toEqual({ out_status: "ok", out_version: 1 });
      expect(await commit(room, 1)).toEqual({ out_status: "ok", out_version: 2 });
      const { rows } = await db.pool.query("select version, state from public.game_states where room_id = $1", [room]);
      expect(rows[0]).toEqual({ version: 2, state: { n: 2 } });
    });

    it("recusa ação baseada em versão desatualizada (duas ações ao mesmo tempo)", async () => {
      const room = await createRoom(db.pool, host);
      await commit(room, 0);
      await commit(room, 1);
      expect(await commit(room, 1)).toEqual({ out_status: "conflict", out_version: 2 });
      expect(await commit(room, 0)).toEqual({ out_status: "conflict", out_version: 2 });
    });

    it("reenvio da mesma ação não duplica (clique duplo, rede instável)", async () => {
      const room = await createRoom(db.pool, host);
      await commit(room, 0);
      const actionId = randomUUID();
      expect(await commit(room, 1, actionId)).toEqual({ out_status: "ok", out_version: 2 });
      expect(await commit(room, 2, actionId)).toEqual({ out_status: "duplicate", out_version: 2 });
      const { rows } = await db.pool.query("select count(*)::int as n from public.game_actions where room_id = $1", [room]);
      expect(rows[0].n).toBe(2);
    });

    it("ações concorrentes na mesma versão: só uma vence", async () => {
      const room = await createRoom(db.pool, host);
      await commit(room, 0);
      const results = await Promise.all(Array.from({ length: 8 }, () => commit(room, 1)));
      expect(results.filter((r) => r.out_status === "ok")).toHaveLength(1);
      expect(results.filter((r) => r.out_status === "conflict")).toHaveLength(7);
    });

    it("registra atividade na sala", async () => {
      const room = await createRoom(db.pool, host);
      await db.pool.query("update public.rooms set last_activity_at = now() - interval '1 hour' where id = $1", [room]);
      await commit(room, 0);
      const { rows } = await db.pool.query("select last_activity_at > now() - interval '1 minute' as fresh from public.rooms where id = $1", [room]);
      expect(rows[0].fresh).toBe(true);
    });
  });

  describe("histórico de rodadas", () => {
    async function setupRound() {
      const room = await createRoom(db.pool, host);
      const game = await db.pool.query("insert into public.games (room_id, settings_snapshot, humor_level) values ($1, '{}', 2) returning id", [room]);
      const card = await db.pool.query("select id from public.black_cards limit 1");
      const white = await db.pool.query("select id from public.white_cards limit 2");
      const round = await db.pool.query("insert into public.rounds (game_id, number, judge_id, black_card_id) values ($1, 1, $2, $3) returning id", [
        game.rows[0].id,
        host,
        card.rows[0].id,
      ]);
      return { gameId: game.rows[0].id, roundId: round.rows[0].id, whiteIds: white.rows.map((r) => r.id) as string[], cardId: card.rows[0].id };
    }

    it("uma resposta por jogador por rodada", async () => {
      const { roundId, whiteIds } = await setupRound();
      await db.pool.query("insert into public.submissions (round_id, player_id, white_card_ids) values ($1, $2, $3)", [roundId, guest, [whiteIds[0]]]);
      await expectPgError(
        db.pool.query("insert into public.submissions (round_id, player_id, white_card_ids) values ($1, $2, $3)", [roundId, guest, [whiteIds[1]]]),
        /submissions_round_id_player_id_key/,
      );
    });

    it("a resposta vencedora precisa ser da mesma rodada", async () => {
      const a = await setupRound();
      const b = await setupRound();
      const sub = await db.pool.query("insert into public.submissions (round_id, player_id, white_card_ids) values ($1, $2, $3) returning id", [
        b.roundId,
        third,
        [b.whiteIds[0]],
      ]);
      await expectPgError(
        db.pool.query("update public.rounds set winning_submission_id = $1 where id = $2", [sub.rows[0].id, a.roundId]),
        /rounds_winner_same_round_fk/,
      );
      await db.pool.query("update public.rounds set winning_submission_id = $1 where id = $2", [sub.rows[0].id, b.roundId]);
    });

    it("carta usada numa rodada não pode ser apagada (só arquivada)", async () => {
      const { cardId } = await setupRound();
      await expectPgError(db.pool.query("delete from public.black_cards where id = $1", [cardId]), /foreign key/);
      await db.pool.query("update public.black_cards set status = 'archived' where id = $1", [cardId]);
    });
  });

  describe("limite de requisições compartilhado", () => {
    it("conta por chave dentro da janela e libera na janela seguinte", async () => {
      const hit = async (key: string, limit = 3) => (await db.pool.query("select public.hit_rate_limit($1, $2, 60) as ok", [key, limit])).rows[0].ok;
      expect([await hit("a"), await hit("a"), await hit("a"), await hit("a")]).toEqual([true, true, true, false]);
      expect(await hit("b")).toBe(true);
      await db.pool.query("update public.rate_limits set window_start = now() - interval '2 minutes' where key = 'a'");
      expect(await hit("a")).toBe(true);
    });

    it("tentativas simultâneas não passam do limite", async () => {
      const results = await Promise.all(Array.from({ length: 20 }, () => db.pool.query("select public.hit_rate_limit('c', 5, 60) as ok")));
      expect(results.filter((r) => r.rows[0].ok)).toHaveLength(5);
    });

    it("cliente não acessa a tabela nem a função", async () => {
      await as(db.pool, "authenticated", host, async (c) => {
        expect((await c.query("select * from public.rate_limits")).rows).toEqual([]);
        await expectPgError(c.query("select public.hit_rate_limit('x', 1, 60)"), /permission denied/);
      });
    });
  });
});

