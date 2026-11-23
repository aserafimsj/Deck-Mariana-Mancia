import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { GameAction } from "@/engine";
import { act, createRoom, joinRoom, viewRoom, type Deps, type RoomResponse, type ServiceResult } from "@/server/game-service";
import { createPgStore } from "@/server/store";
import { ADMIN_URL, createTestDb, type TestDb } from "./helpers";

function data(r: ServiceResult): RoomResponse {
  if (!r.ok) throw new Error(`falhou: ${r.error.code} ${r.error.message}`);
  return r.data;
}

describe.skipIf(!ADMIN_URL)("servidor do jogo (serviço + banco real)", () => {
  let db: TestDb;
  let deps: Deps;
  let clock = 1_700_000_000_000;
  const notified: { code: string; version: number }[] = [];
  const users = { ana: randomUUID(), beto: randomUUID(), cris: randomUUID(), duda: randomUUID(), estranho: randomUUID() };

  beforeAll(async () => {
    db = await createTestDb();
    deps = {
      store: createPgStore(db.pool),
      notify: async (code, version) => void notified.push({ code, version }),
      now: () => clock,
      randomBytes: (n) => new Uint8Array(randomBytes(n)),
    };
  });

  afterAll(async () => {
    await db?.drop();
  });

  async function roomWith3(settings = {}) {
    const created = data(await createRoom(deps, users.ana, { nickname: "Ana", settings }));
    data(await joinRoom(deps, users.beto, created.code, { nickname: "Beto" }));
    data(await joinRoom(deps, users.cris, created.code, { nickname: "Cris" }));
    return created.code;
  }

  const send = (user: string, code: string, action: GameAction, id = randomUUID()) => act(deps, user, code, action, id);

  it("cria a sala e grava tudo no banco", async () => {
    const r = data(await createRoom(deps, users.ana, { nickname: "  Ana  ", settings: { pointsToWin: 5 } }));
    expect(r.code).toMatch(/^[A-Z2-9]{5}$/);
    expect(r.version).toBe(1);
    expect(r.view.phase).toBe("lobby");
    expect(r.view.you).toMatchObject({ id: users.ana, isHost: true });
    const room = await db.pool.query("select host_id, settings->>'pointsToWin' as pts from public.rooms where code = $1", [r.code]);
    expect(room.rows[0]).toEqual({ host_id: users.ana, pts: "5" });
    const players = await db.pool.query("select nickname from public.room_players rp join public.rooms r on r.id = rp.room_id where r.code = $1", [r.code]);
    expect(players.rows).toEqual([{ nickname: "Ana" }]);
  });

  it("recusa apelido e regras inválidos", async () => {
    expect(await createRoom(deps, users.ana, { nickname: "A" })).toMatchObject({ ok: false, error: { code: "INVALID_NICKNAME" } });
    expect(await createRoom(deps, users.ana, { nickname: "Ana", settings: { pointsToWin: 99 } })).toMatchObject({ ok: false, error: { code: "INVALID_SETTINGS" } });
  });

  it("sala inexistente ou código inválido: mensagem clara", async () => {
    expect(await viewRoom(deps, users.ana, "ZZZZZ")).toMatchObject({ ok: false, error: { status: 404, code: "ROOM_NOT_FOUND" } });
    expect(await viewRoom(deps, users.ana, "x")).toMatchObject({ ok: false, error: { code: "ROOM_NOT_FOUND" } });
  });

  it("entrar espelha o jogador em room_players (para as regras de acesso) e avisa a sala", async () => {
    const before = notified.length;
    const code = await roomWith3();
    expect(notified.length - before).toBe(2);
    const { rows } = await db.pool.query(
      "select nickname, seat from public.room_players rp join public.rooms r on r.id = rp.room_id where r.code = $1 order by seat",
      [code],
    );
    expect(rows).toEqual([
      { nickname: "Ana", seat: 0 },
      { nickname: "Beto", seat: 1 },
      { nickname: "Cris", seat: 2 },
    ]);
  });

  it("quem não está na sala vê só a parte pública e não consegue agir", async () => {
    const code = await roomWith3();
    const v = data(await viewRoom(deps, users.estranho, code));
    expect(v.view.you).toBeNull();
    expect(await send(users.estranho, code, { type: "START_GAME" })).toMatchObject({ ok: false, error: { status: 403, code: "NOT_IN_ROOM" } });
  });

  it("partida completa pelo servidor, com cartas do banco", async () => {
    const code = await roomWith3({ pointsToWin: 3 });
    let r = data(await send(users.ana, code, { type: "START_GAME" }));
    expect(r.view.phase).toBe("submitting");
    expect(r.view.you!.hand).toHaveLength(7);

    const views = async () => Object.fromEntries(await Promise.all(Object.entries(users).slice(0, 3).map(async ([k, id]) => [k, data(await viewRoom(deps, id, code))])));
    let v = await views();
    const judge = v.ana.view.round!.judgeId;
    for (const [name, id] of Object.entries(users).slice(0, 3)) {
      if (id === judge) continue;
      const card = v[name].view.you!.hand[0]!;
      r = data(await send(id, code, { type: "SUBMIT", cardIds: [card.id] }));
    }
    expect(r.view.phase).toBe("judging");
    for (let i = 0; i < 2; i++) r = data(await send(judge, code, { type: "REVEAL_NEXT" }));
    r = data(await send(judge, code, { type: "PICK_WINNER", answerIndex: 0 }));
    expect(r.view.phase).toBe("round_result");
    expect(r.view.players.reduce((a, p) => a + p.score, 0)).toBe(1);

    // A próxima rodada começa sozinha quando o tempo do resultado passa (qualquer sinal de vida dispara).
    clock += 9_000;
    v = await views();
    expect(v.beto.view.phase).toBe("submitting");
    expect(v.beto.view.round!.number).toBe(2);
    const status = await db.pool.query("select status from public.rooms where code = $1", [code]);
    expect(status.rows[0].status).toBe("playing");
  });

  it("reenvio da mesma ação (clique duplo) não duplica", async () => {
    const code = await roomWith3();
    data(await send(users.ana, code, { type: "START_GAME" }));
    const v = data(await viewRoom(deps, users.beto, code));
    const judge = v.view.round!.judgeId;
    const player = judge === users.beto ? users.cris : users.beto;
    const hand = data(await viewRoom(deps, player, code)).view.you!.hand;
    const id = randomUUID();
    const first = data(await send(player, code, { type: "SUBMIT", cardIds: [hand[0]!.id] }, id));
    const second = data(await send(player, code, { type: "SUBMIT", cardIds: [hand[0]!.id] }, id));
    expect(second.version).toBe(first.version);
    expect(second.view.you!.hand).toHaveLength(6);
  });

  it("ações simultâneas de jogadores diferentes: todas valem (tentativa automática)", async () => {
    const code = await roomWith3();
    data(await joinRoom(deps, users.duda, code, { nickname: "Duda" }));
    data(await send(users.ana, code, { type: "START_GAME" }));
    const judge = data(await viewRoom(deps, users.ana, code)).view.round!.judgeId;
    const players = [users.ana, users.beto, users.cris, users.duda].filter((u) => u !== judge);
    const hands = await Promise.all(players.map(async (u) => data(await viewRoom(deps, u, code)).view.you!.hand[0]!.id));
    const results = await Promise.all(players.map((u, i) => send(u, code, { type: "SUBMIT", cardIds: [hands[i]!] })));
    for (const r of results) expect(r.ok).toBe(true);
    const after = data(await viewRoom(deps, judge, code));
    expect(after.view.phase).toBe("judging");
    expect(after.view.round!.answers).toHaveLength(3);
  });

  it("sinal de vida sem mudança não cria versão nova", async () => {
    const code = await roomWith3();
    const a = data(await viewRoom(deps, users.beto, code));
    const b = data(await viewRoom(deps, users.cris, code));
    expect(b.version).toBe(a.version);
  });

  it("quem para de dar sinal de vida aparece offline; ao voltar, fica online", async () => {
    const code = await roomWith3();
    await db.pool.query(
      "update public.room_players set last_seen_at = now() - interval '1 minute' where user_id = $1 and room_id = (select id from public.rooms where code = $2 and status <> 'closed')",
      [users.cris, code],
    );
    let v = data(await viewRoom(deps, users.ana, code));
    expect(v.view.players.find((p) => p.id === users.cris)!.online).toBe(false);
    v = data(await viewRoom(deps, users.cris, code));
    expect(v.view.players.find((p) => p.id === users.cris)!.online).toBe(true);
  });

  it("jogador removido recebe 403 e não volta", async () => {
    const code = await roomWith3();
    data(await send(users.ana, code, { type: "KICK", playerId: users.cris }));
    expect(await viewRoom(deps, users.cris, code)).toMatchObject({ ok: false, error: { status: 403, code: "KICKED" } });
    expect(await joinRoom(deps, users.cris, code, { nickname: "Cris" })).toMatchObject({ ok: false, error: { code: "KICKED" } });
    const { rows } = await db.pool.query(
      "select status from public.room_players where user_id = $1 and room_id = (select id from public.rooms where code = $2 and status <> 'closed')",
      [users.cris, code],
    );
    expect(rows[0].status).toBe("kicked");
  });

  it("filtro de categorias sem cartas suficientes: erro explicado", async () => {
    const code = await roomWith3();
    data(await send(users.ana, code, { type: "UPDATE_SETTINGS", settings: { categorySlugs: ["trabalho"], humorLevel: 1 } }));
    expect(await send(users.ana, code, { type: "START_GAME" })).toMatchObject({ ok: false, error: { code: "NOT_ENOUGH_CARDS" } });
  });

  it("quem saiu libera o apelido para outra pessoa", async () => {
    const code = await roomWith3();
    data(await send(users.cris, code, { type: "LEAVE" }));
    data(await joinRoom(deps, users.duda, code, { nickname: "cris" }));
  });
});
