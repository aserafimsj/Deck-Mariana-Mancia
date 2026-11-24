import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { GameAction } from "@/engine";
import { AdminError, createAdminStore, type AdminStore } from "@/server/admin-store";
import { act, createRoom, joinRoom, viewRoom, type Deps, type RoomResponse, type ServiceResult } from "@/server/game-service";
import { createPgStore } from "@/server/store";
import { ADMIN_URL, createTestDb, createUser, type TestDb } from "./helpers";

function data(r: ServiceResult): RoomResponse {
  if (!r.ok) throw new Error(`falhou: ${r.error.code}`);
  return r.data;
}

async function expectAdminError(p: Promise<unknown>, code: string) {
  await expect(p).rejects.toSatisfy((e: unknown) => e instanceof AdminError && e.code === code);
}

describe.skipIf(!ADMIN_URL)("painel administrativo (banco real)", () => {
  let db: TestDb;
  let admin: AdminStore;
  let deps: Deps;
  let editorId: string;
  const clock = Date.now();

  beforeAll(async () => {
    db = await createTestDb();
    admin = createAdminStore(db.pool);
    editorId = await createUser(db.pool, { anonymous: false, role: "editor" });
    deps = { store: createPgStore(db.pool), notify: async () => {}, now: () => clock, randomBytes: (n) => new Uint8Array(randomBytes(n)) };
  });

  afterAll(async () => {
    await db?.drop();
  });

  describe("cartas", () => {
    it("lista com filtros e paginação", async () => {
      const all = await admin.listCards("white", {});
      expect(all.total).toBeGreaterThanOrEqual(300);
      expect(all.items).toHaveLength(all.pageSize);
      const l4 = await admin.listCards("white", { level: 4 });
      expect(l4.items.every((c) => c.humorLevel === 4)).toBe(true);
      const search = await admin.listCards("white", { q: "boleto" });
      expect(search.items.some((c) => c.text === "Um boleto vencido.")).toBe(true);
      const cat = await admin.listCards("black", { category: "familia" });
      expect(cat.items.every((c) => c.categorySlug === "familia")).toBe(true);
      // Busca com caracteres especiais não quebra a consulta.
      expect((await admin.listCards("white", { q: "100%_\\" })).items).toEqual([]);
    });

    it("cria, edita e arquiva; carta arquivada sai do baralho do jogo", async () => {
      const { id } = await admin.createCard("white", { text: "Uma carta nova do painel.", humorLevel: 1, categorySlug: "absurdo", status: "active" }, editorId);
      await admin.updateCard("white", id, { text: "Uma carta editada no painel.", humorLevel: 2 });
      let row = (await admin.listCards("white", { q: "editada no painel" })).items[0]!;
      expect(row).toMatchObject({ id, humorLevel: 2, status: "active", categorySlug: "absurdo" });
      expect((await deps.store.loadCards(4, [])).white.some((c) => c.id === id)).toBe(true);

      await admin.updateCard("white", id, { status: "archived" });
      row = (await admin.listCards("white", { q: "editada no painel" })).items[0]!;
      expect(row.status).toBe("archived");
      expect((await deps.store.loadCards(4, [])).white.some((c) => c.id === id)).toBe(false);
    });

    it("pergunta com duas lacunas vira ESCOLHA 2 automaticamente", async () => {
      const { id } = await admin.createCard("black", { text: "___ com ___ no painel.", humorLevel: 1, categorySlug: null, status: "active" }, editorId);
      expect((await admin.listCards("black", { q: "no painel" })).items.find((c) => c.id === id)!.pick).toBe(2);
      await admin.updateCard("black", id, { text: "Só ___ no painel." });
      expect((await admin.listCards("black", { q: "no painel" })).items.find((c) => c.id === id)!.pick).toBe(1);
    });

    it("recusa texto repetido e categoria inexistente", async () => {
      await expectAdminError(admin.createCard("white", { text: "UM BOLETO VENCIDO.", humorLevel: 1, categorySlug: null, status: "active" }, editorId), "DUPLICATE");
      await expectAdminError(admin.createCard("white", { text: "Outra.", humorLevel: 1, categorySlug: "nao-existe", status: "active" }, editorId), "UNKNOWN_CATEGORY");
    });

    it("rascunho não entra no jogo", async () => {
      const { id } = await admin.createCard("white", { text: "Rascunho do painel.", humorLevel: 1, categorySlug: null, status: "draft" }, editorId);
      expect((await deps.store.loadCards(4, [])).white.some((c) => c.id === id)).toBe(false);
    });

    it("importação: cria as novas, aponta as repetidas, tudo ou nada", async () => {
      const r = await admin.importCards(
        "white",
        [
          { line: 1, text: "Importada número um.", humorLevel: 1, categorySlug: "cotidiano" },
          { line: 2, text: "Um boleto vencido.", humorLevel: 1, categorySlug: null },
          { line: 3, text: "Importada número dois.", humorLevel: 3, categorySlug: null },
        ],
        editorId,
      );
      expect(r).toEqual({ created: 2, duplicates: [2] });
      await expectAdminError(admin.importCards("white", [{ line: 1, text: "Nunca entra.", humorLevel: 1, categorySlug: "inventada" }], editorId), "UNKNOWN_CATEGORY");
      expect((await admin.listCards("white", { q: "Nunca entra" })).total).toBe(0);
    });
  });

  describe("categorias", () => {
    it("cria, renomeia e desativa", async () => {
      await admin.createCategory({ slug: "futebol", name: "Futebol", color: "#3FE0CF", isActive: true });
      await expectAdminError(admin.createCategory({ slug: "futebol", name: "De novo", color: null, isActive: true }), "DUPLICATE");
      await admin.updateCategory("futebol", { name: "Futebol de várzea", isActive: false });
      const cat = (await admin.listCategories()).find((c) => c.slug === "futebol")!;
      expect(cat).toMatchObject({ name: "Futebol de várzea", isActive: false, black: 0, white: 0 });
      await expectAdminError(admin.updateCategory("nao-existe", { name: "X" }), "NOT_FOUND");
    });
  });

  describe("histórico e estatísticas de uma partida real", () => {
    let code: string;
    const [ana, beto, cris] = [randomUUID(), randomUUID(), randomUUID()];
    const send = (u: string, a: GameAction) => act(deps, u, code, a, randomUUID());

    beforeAll(async () => {
      code = data(await createRoom(deps, ana, { nickname: "Ana", settings: { pointsToWin: 3 } })).code;
      data(await joinRoom(deps, beto, code, { nickname: "Beto" }));
      data(await joinRoom(deps, cris, code, { nickname: "Cris" }));
      data(await send(ana, { type: "START_GAME" }));
      for (let i = 0; i < 40; i++) {
        const v = data(await viewRoom(deps, ana, code)).view;
        if (v.phase === "game_over") break;
        if (v.phase === "round_result") {
          data(await send(v.hostId, { type: "NEXT_ROUND" }));
          continue;
        }
        const r = v.round!;
        if (v.phase === "submitting") {
          for (const u of [ana, beto, cris]) {
            if (u === r.judgeId) continue;
            const me = data(await viewRoom(deps, u, code)).view;
            if (me.phase !== "submitting" || me.you!.submission) continue;
            data(await send(u, { type: "SUBMIT", cardIds: me.you!.hand.slice(0, r.blackCard.pick).map((c) => c.id) }));
          }
        } else if (v.phase === "judging") {
          for (let k = 0; k < r.answers.length; k++) await send(r.judgeId, { type: "REVEAL_NEXT" });
          data(await send(r.judgeId, { type: "PICK_WINNER", answerIndex: 0 }));
        }
      }
    });

    it("grava a partida, as rodadas, as respostas e o placar final", async () => {
      const v = data(await viewRoom(deps, ana, code)).view;
      expect(v.phase).toBe("game_over");
      const games = await admin.listGames();
      const game = games.find((g) => g.code === code)!;
      expect(game.endReason).toBe("points");
      expect(game.players).toBe(3); // o juiz muda a cada rodada, então todos responderam alguma vez
      expect(game.rounds).toBeGreaterThanOrEqual(3);
      expect(game.winner).toBe(v.result!.ranking[0]!.nickname);
      const { rows } = await db.pool.query(
        "select count(*)::int as n, count(*) filter (where winning_submission_id is not null)::int as won from public.rounds r join public.games g on g.id = r.game_id where g.id = $1",
        [game.id],
      );
      expect(rows[0].won).toBe(v.result!.stats.rounds);
      const players = await db.pool.query("select nickname, score, final_rank from public.game_players where game_id = $1 order by final_rank, nickname", [game.id]);
      expect(players.rows).toHaveLength(3);
      expect(players.rows[0].score).toBe(3);
    });

    it("estatísticas refletem a partida", async () => {
      const s = await admin.stats();
      expect(s.gamesWeek).toBeGreaterThanOrEqual(1);
      expect(s.completionRate).toBe(100);
      expect(s.gamesPerRoom).toBeGreaterThanOrEqual(1);
      expect(s.playersWeek).toBeGreaterThanOrEqual(3);
      expect(s.roundsWeek).toBeGreaterThanOrEqual(3);
      expect(s.activeWhite).toBeGreaterThan(300);
    });

    it("contagem de uso por carta aparece na lista e impede apagar carta usada", async () => {
      const used = (await admin.listCards("white", { sort: "plays" })).items[0]!;
      expect(used.plays).toBeGreaterThanOrEqual(1);
      await expectAdminError(admin.deleteCard("white", used.id), "CARD_IN_USE");
      const usedBlack = (await admin.listCards("black", { sort: "plays" })).items[0]!;
      await expectAdminError(admin.deleteCard("black", usedBlack.id), "CARD_IN_USE");
      const { id } = await admin.createCard("white", { text: "Carta descartável.", humorLevel: 1, categorySlug: null, status: "draft" }, editorId);
      await admin.deleteCard("white", id);
      await expectAdminError(admin.deleteCard("white", id), "NOT_FOUND");
    });

    it("sala fechada por inatividade encerra a partida como abandonada", async () => {
      const c2 = data(await createRoom(deps, ana, { nickname: "Ana" })).code;
      data(await joinRoom(deps, beto, c2, { nickname: "Beto" }));
      data(await joinRoom(deps, cris, c2, { nickname: "Cris" }));
      data(await act(deps, ana, c2, { type: "START_GAME" }, randomUUID()));
      await db.pool.query("update public.rooms set last_activity_at = now() - interval '3 hours' where code = $1 and status <> 'closed'", [c2]);
      await db.pool.query("select public.close_inactive_rooms()");
      const g = (await admin.listGames()).find((x) => x.code === c2)!;
      expect(g.endReason).toBe("abandoned");
      expect(g.endedAt).not.toBeNull();
    });
  });

  describe("equipe", () => {
    it("dá e tira papéis por e-mail, sem deixar o painel sem administrador", async () => {
      const a1 = await createUser(db.pool, { anonymous: false, role: "admin" });
      await db.pool.query("update auth.users set email = 'admin1@teste.local' where id = $1", [a1]);
      const other = await createUser(db.pool, { anonymous: false });
      await db.pool.query("update auth.users set email = 'Nova@Teste.local' where id = $1", [other]);

      await expectAdminError(admin.grantRole("ninguem@teste.local", "editor"), "USER_NOT_FOUND");
      await admin.grantRole("nova@teste.local", "admin");
      expect(await admin.rolesOf(other)).toEqual(["admin"]);
      const staff = await admin.listStaff();
      expect(staff.find((s) => s.id === other)?.email).toBe("Nova@Teste.local");

      await expectAdminError(admin.revokeRole(a1, "admin", a1), "SELF_DEMOTE");
      await admin.revokeRole(other, "admin", a1);
      expect(await admin.rolesOf(other)).toEqual([]);
      // a1 é agora o único admin: não pode ser removido
      await db.pool.query("delete from public.user_roles where role = 'admin' and user_id <> $1", [a1]);
      await expectAdminError(admin.revokeRole(a1, "admin", other), "LAST_ADMIN");
    });
  });
});
