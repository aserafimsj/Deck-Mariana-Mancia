import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ADMIN_URL, addPlayer, as, createRoom, createTestDb, createUser, expectPgError, type TestDb } from "./helpers";

describe.skipIf(!ADMIN_URL)("banco: permissões (RLS)", () => {
  let db: TestDb;
  let host: string, guest: string, outsider: string, kicked: string, editor: string, admin: string;
  let roomId: string;

  beforeAll(async () => {
    db = await createTestDb();
    [host, guest, outsider, kicked] = await Promise.all([createUser(db.pool), createUser(db.pool), createUser(db.pool), createUser(db.pool)]);
    editor = await createUser(db.pool, { anonymous: false, role: "editor" });
    admin = await createUser(db.pool, { anonymous: false, role: "admin" });
    roomId = await createRoom(db.pool, host);
    await addPlayer(db.pool, roomId, host, "Ana", 0);
    await addPlayer(db.pool, roomId, guest, "Beto", 1);
    await addPlayer(db.pool, roomId, kicked, "Duda", 2, "kicked");
    await db.pool.query("insert into public.game_states (room_id, version, state) values ($1, 1, $2)", [
      roomId,
      JSON.stringify({ hands: { [guest]: ["carta secreta"] } }),
    ]);
  });

  afterAll(async () => {
    await db?.drop();
  });

  describe("identidade", () => {
    it("o gatilho cria o perfil de cada usuário novo", async () => {
      const { rows } = await db.pool.query("select is_anonymous from public.profiles where id = $1", [host]);
      expect(rows).toEqual([{ is_anonymous: true }]);
    });

    it("cada um vê só o próprio perfil", async () => {
      const rows = await as(db.pool, "authenticated", guest, (c) => c.query("select id from public.profiles").then((r) => r.rows));
      expect(rows).toEqual([{ id: guest }]);
    });

    it("jogador não consegue se promover a admin", async () => {
      await as(db.pool, "authenticated", guest, (c) =>
        expectPgError(c.query("insert into public.user_roles (user_id, role) values ($1, 'admin')", [guest]), /row-level security/),
      );
    });

    it("admin pode conceder papéis", async () => {
      await as(db.pool, "authenticated", admin, async (c) => {
        await c.query("insert into public.user_roles (user_id, role) values ($1, 'editor')", [guest]);
        const { rows } = await c.query("select role from public.user_roles where user_id = $1", [guest]);
        expect(rows).toEqual([{ role: "editor" }]);
      });
    });
  });

  describe("cartas", () => {
    it("visitante sem login não lê nada", async () => {
      const n = await as(db.pool, "anon", null, (c) => c.query("select count(*)::int as n from public.white_cards").then((r) => r.rows[0].n));
      expect(n).toBe(0);
    });

    it("jogador comum não lê o baralho (cartas chegam só pela própria mão, via servidor)", async () => {
      const n = await as(db.pool, "authenticated", guest, (c) => c.query("select count(*)::int as n from public.black_cards").then((r) => r.rows[0].n));
      expect(n).toBe(0);
    });

    it("jogador comum não cria nem edita cartas", async () => {
      await as(db.pool, "authenticated", guest, async (c) => {
        const upd = await c.query("update public.white_cards set text = 'hackeado'");
        expect(upd.rowCount).toBe(0);
        // Por último: um erro aborta a transação de teste.
        const deck = await db.pool.query("select id from public.decks where slug = 'base'");
        await expectPgError(
          c.query("insert into public.white_cards (deck_id, text) values ($1, 'Carta pirata')", [deck.rows[0].id]),
          /row-level security/,
        );
      });
    });

    it("editor lê, cria e arquiva cartas, mas não apaga", async () => {
      await as(db.pool, "authenticated", editor, async (c) => {
        const { rows } = await c.query("select count(*)::int as n from public.white_cards");
        expect(rows[0].n).toBeGreaterThan(50);
        const deck = await c.query("select id from public.decks where slug = 'base'");
        const ins = await c.query("insert into public.white_cards (deck_id, text, humor_level) values ($1, 'Carta nova do editor', 1) returning id", [
          deck.rows[0].id,
        ]);
        const id = ins.rows[0].id;
        const arch = await c.query("update public.white_cards set status = 'archived' where id = $1", [id]);
        expect(arch.rowCount).toBe(1);
        const del = await c.query("delete from public.white_cards where id = $1", [id]);
        expect(del.rowCount).toBe(0);
      });
    });
  });

  describe("salas", () => {
    it("membro vê a sala e a lista de jogadores ativos e expulsos", async () => {
      await as(db.pool, "authenticated", guest, async (c) => {
        expect((await c.query("select id from public.rooms")).rows).toEqual([{ id: roomId }]);
        const nicks = (await c.query("select nickname from public.room_players order by seat")).rows.map((r) => r.nickname);
        expect(nicks).toEqual(["Ana", "Beto", "Duda"]);
      });
    });

    it("quem não está na sala não vê nada dela", async () => {
      await as(db.pool, "authenticated", outsider, async (c) => {
        expect((await c.query("select id from public.rooms")).rows).toEqual([]);
        expect((await c.query("select * from public.room_players")).rows).toEqual([]);
      });
    });

    it("jogador expulso perde o acesso", async () => {
      await as(db.pool, "authenticated", kicked, async (c) => {
        expect((await c.query("select id from public.rooms")).rows).toEqual([]);
      });
    });

    it("ninguém altera sala ou jogadores direto pelo cliente", async () => {
      await as(db.pool, "authenticated", host, async (c) => {
        expect((await c.query("update public.rooms set humor_level = 4")).rowCount).toBe(0);
        expect((await c.query("update public.room_players set status = 'active'")).rowCount).toBe(0);
        await expectPgError(c.query("insert into public.room_players (room_id, user_id, nickname, seat) values ($1, $2, 'Intruso', 9)", [roomId, outsider]), /row-level security/);
      });
    });
  });

  describe("estado da partida e histórico", () => {
    it("nem membros da sala leem o estado completo (mãos e baralho)", async () => {
      for (const user of [host, guest]) {
        const rows = await as(db.pool, "authenticated", user, (c) => c.query("select * from public.game_states").then((r) => r.rows));
        expect(rows).toEqual([]);
      }
    });

    it("cliente não escreve estado, ações nem pontuação", async () => {
      await as(db.pool, "authenticated", guest, async (c) => {
        expect((await c.query("update public.game_states set version = 99")).rowCount).toBe(0);
        expect((await c.query("update public.game_players set score = 100")).rowCount).toBe(0);
        await expectPgError(
          c.query("insert into public.game_actions (room_id, client_action_id, type, result_version) values ($1, $2, 'X', 1)", [roomId, randomUUID()]),
          /row-level security/,
        );
      });
    });

    it("cliente não consegue chamar a função de gravar transições", async () => {
      await as(db.pool, "authenticated", guest, (c) =>
        expectPgError(
          c.query("select * from public.commit_game_transition($1, 1, '{}'::jsonb, $2, $3, 'X')", [roomId, guest, randomUUID()]),
          /permission denied/,
        ),
      );
    });

    it("o servidor (service_role) lê e grava normalmente", async () => {
      await as(db.pool, "service_role", null, async (c) => {
        const { rows } = await c.query("select version from public.game_states where room_id = $1", [roomId]);
        expect(rows).toEqual([{ version: 1 }]);
      });
    });
  });
});
