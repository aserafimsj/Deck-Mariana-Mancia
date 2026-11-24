import type pg from "pg";
import type { CardInput, CardKind, CardStatus, ImportRow, Role } from "@/lib/admin-schemas";
import { blanksIn } from "@/lib/admin-schemas";

/**
 * Consultas do painel administrativo. O servidor confere o papel (admin/editor)
 * antes de chamar qualquer função daqui.
 */

const TABLE: Record<CardKind, string> = { black: "public.black_cards", white: "public.white_cards" };

export type CardRow = {
  id: string;
  kind: CardKind;
  text: string;
  pick: 1 | 2 | null;
  humorLevel: 1 | 2 | 3 | 4;
  status: CardStatus;
  categorySlug: string | null;
  categoryName: string | null;
  plays: number;
  wins: number;
  updatedAt: string;
};

export type CardFilters = { q?: string; level?: number; category?: string; status?: CardStatus; page?: number; sort?: "recent" | "wins" | "plays" | "text" };

export class AdminError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

const PAGE = 50;
const UNIQUE = "23505";

export function createAdminStore(pool: pg.Pool) {
  async function baseDeckId(): Promise<string> {
    const { rows } = await pool.query<{ id: string }>("select id from public.decks where slug = 'base'");
    if (!rows[0]) throw new AdminError(500, "NO_DECK", "Baralho base não encontrado. Rode o seed.");
    return rows[0].id;
  }

  async function categoryId(slug: string | null | undefined): Promise<string | null> {
    if (!slug) return null;
    const { rows } = await pool.query<{ id: string }>("select id from public.categories where slug = $1", [slug]);
    if (!rows[0]) throw new AdminError(422, "UNKNOWN_CATEGORY", `Categoria "${slug}" não existe.`);
    return rows[0].id;
  }

  /** Quantas vezes cada carta foi jogada e quantas venceu (para curadoria). */
  function usageJoin(kind: CardKind) {
    return kind === "white"
      ? `left join lateral (
           select count(*)::int as plays,
                  count(*) filter (where r.winning_submission_id = s.id)::int as wins
           from public.submissions s join public.rounds r on r.id = s.round_id
           where s.white_card_ids @> array[x.id]
         ) u on true`
      : `left join lateral (
           select count(*)::int as plays, count(*) filter (where r.winning_submission_id is not null)::int as wins
           from public.rounds r where r.black_card_id = x.id
         ) u on true`;
  }

  return {
    async listCards(kind: CardKind, f: CardFilters): Promise<{ items: CardRow[]; total: number; pageSize: number }> {
      const where: string[] = [];
      const params: unknown[] = [];
      const add = (sql: string, v: unknown) => {
        params.push(v);
        where.push(sql.replace("$?", `$${params.length}`));
      };
      if (f.q) add("x.text ilike $?", `%${f.q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`);
      if (f.level) add("x.humor_level = $?", f.level);
      if (f.status) add("x.status = $?", f.status);
      if (f.category === "none") where.push("x.category_id is null");
      else if (f.category) add("c.slug = $?", f.category);
      const whereSql = where.length ? `where ${where.join(" and ")}` : "";
      const order = { recent: "x.updated_at desc", wins: "u.wins desc, u.plays desc", plays: "u.plays desc", text: "x.text asc" }[f.sort ?? "recent"];
      const page = Math.max(1, f.page ?? 1);
      const pick = kind === "black" ? "x.pick" : "null::smallint";
      const sql = `
        select x.id, x.text, ${pick} as pick, x.humor_level, x.status, c.slug as category_slug, c.name as category_name,
               coalesce(u.plays, 0) as plays, coalesce(u.wins, 0) as wins, x.updated_at, count(*) over () as total
        from ${TABLE[kind]} x
        left join public.categories c on c.id = x.category_id
        ${usageJoin(kind)}
        ${whereSql}
        order by ${order}, x.id
        limit ${PAGE} offset ${(page - 1) * PAGE}`;
      const { rows } = await pool.query(sql, params);
      return {
        total: rows[0] ? Number(rows[0].total) : 0,
        pageSize: PAGE,
        items: rows.map((r) => ({
          id: r.id,
          kind,
          text: r.text,
          pick: r.pick,
          humorLevel: r.humor_level,
          status: r.status,
          categorySlug: r.category_slug,
          categoryName: r.category_name,
          plays: r.plays,
          wins: r.wins,
          updatedAt: r.updated_at.toISOString(),
        })),
      };
    },

    async createCard(kind: CardKind, input: CardInput, authorId: string): Promise<{ id: string }> {
      const deckId = await baseDeckId();
      const catId = await categoryId(input.categorySlug);
      try {
        const cols = kind === "black" ? "deck_id, category_id, text, humor_level, status, author_id, pick" : "deck_id, category_id, text, humor_level, status, author_id";
        const vals = kind === "black" ? "$1, $2, $3, $4, $5, $6, $7" : "$1, $2, $3, $4, $5, $6";
        const params = [deckId, catId, input.text, input.humorLevel, input.status, authorId];
        if (kind === "black") params.push(blanksIn(input.text) === 2 ? 2 : 1);
        const { rows } = await pool.query<{ id: string }>(`insert into ${TABLE[kind]} (${cols}) values (${vals}) returning id`, params);
        return rows[0]!;
      } catch (e) {
        if ((e as { code?: string }).code === UNIQUE) throw new AdminError(409, "DUPLICATE", "Já existe uma carta com esse texto.");
        throw e;
      }
    },

    async updateCard(kind: CardKind, id: string, patch: Partial<CardInput>): Promise<void> {
      const sets: string[] = [];
      const params: unknown[] = [id];
      const set = (col: string, v: unknown) => {
        params.push(v);
        sets.push(`${col} = $${params.length}`);
      };
      if (patch.text !== undefined) {
        set("text", patch.text);
        if (kind === "black") set("pick", blanksIn(patch.text) === 2 ? 2 : 1);
      }
      if (patch.humorLevel !== undefined) set("humor_level", patch.humorLevel);
      if (patch.status !== undefined) set("status", patch.status);
      if (patch.categorySlug !== undefined) set("category_id", await categoryId(patch.categorySlug));
      try {
        const r = await pool.query(`update ${TABLE[kind]} set ${sets.join(", ")} where id = $1`, params);
        if (r.rowCount === 0) throw new AdminError(404, "NOT_FOUND", "Carta não encontrada.");
      } catch (e) {
        if ((e as { code?: string }).code === UNIQUE) throw new AdminError(409, "DUPLICATE", "Já existe uma carta com esse texto.");
        throw e;
      }
    },

    /** Só apaga carta que nunca foi usada; as usadas devem ser arquivadas (preserva o histórico). */
    async deleteCard(kind: CardKind, id: string): Promise<void> {
      const used =
        kind === "white"
          ? await pool.query("select 1 from public.submissions where white_card_ids @> array[$1::uuid] limit 1", [id])
          : await pool.query("select 1 from public.rounds where black_card_id = $1 limit 1", [id]);
      if (used.rowCount) throw new AdminError(409, "CARD_IN_USE", "Essa carta já apareceu em partidas. Arquive em vez de apagar.");
      const r = await pool.query(`delete from ${TABLE[kind]} where id = $1`, [id]);
      if (r.rowCount === 0) throw new AdminError(404, "NOT_FOUND", "Carta não encontrada.");
    },

    async importCards(kind: CardKind, rows: ImportRow[], authorId: string): Promise<{ created: number; duplicates: number[] }> {
      const deckId = await baseDeckId();
      const cats = new Map((await pool.query<{ id: string; slug: string }>("select id, slug from public.categories")).rows.map((r) => [r.slug, r.id]));
      for (const r of rows) {
        if (r.categorySlug && !cats.has(r.categorySlug)) throw new AdminError(422, "UNKNOWN_CATEGORY", `Linha ${r.line}: categoria "${r.categorySlug}" não existe.`);
      }
      const client = await pool.connect();
      let created = 0;
      const duplicates: number[] = [];
      try {
        await client.query("begin");
        for (const r of rows) {
          const params: unknown[] = [deckId, r.categorySlug ? cats.get(r.categorySlug) : null, r.text, r.humorLevel, authorId];
          const sql =
            kind === "black"
              ? `insert into public.black_cards (deck_id, category_id, text, humor_level, author_id, pick) values ($1, $2, $3, $4, $5, $6) on conflict (deck_id, lower(text)) do nothing`
              : `insert into public.white_cards (deck_id, category_id, text, humor_level, author_id) values ($1, $2, $3, $4, $5) on conflict (deck_id, lower(text)) do nothing`;
          if (kind === "black") params.push(blanksIn(r.text) === 2 ? 2 : 1);
          const res = await client.query(sql, params);
          if (res.rowCount) created++;
          else duplicates.push(r.line);
        }
        await client.query("commit");
      } catch (e) {
        await client.query("rollback").catch(() => undefined);
        throw e;
      } finally {
        client.release();
      }
      return { created, duplicates };
    },

    // ----- Categorias -----
    async listCategories() {
      const { rows } = await pool.query(
        `select c.slug, c.name, c.color, c.is_active,
                (select count(*)::int from public.black_cards b where b.category_id = c.id) as black,
                (select count(*)::int from public.white_cards w where w.category_id = c.id) as white
         from public.categories c order by c.sort_order, c.name`,
      );
      return rows.map((r) => ({ slug: r.slug, name: r.name, color: r.color, isActive: r.is_active, black: r.black, white: r.white }));
    },

    async createCategory(c: { slug: string; name: string; color: string | null; isActive: boolean }) {
      try {
        await pool.query(
          "insert into public.categories (slug, name, color, is_active, sort_order) values ($1, $2, $3, $4, (select coalesce(max(sort_order), 0) + 1 from public.categories))",
          [c.slug, c.name, c.color, c.isActive],
        );
      } catch (e) {
        if ((e as { code?: string }).code === UNIQUE) throw new AdminError(409, "DUPLICATE", "Já existe uma categoria com esse identificador.");
        throw e;
      }
    },

    async updateCategory(slug: string, patch: { name?: string; color?: string | null; isActive?: boolean }) {
      const sets: string[] = [];
      const params: unknown[] = [slug];
      for (const [col, v] of [
        ["name", patch.name],
        ["color", patch.color],
        ["is_active", patch.isActive],
      ] as const) {
        if (v === undefined) continue;
        params.push(v);
        sets.push(`${col} = $${params.length}`);
      }
      if (!sets.length) return;
      const r = await pool.query(`update public.categories set ${sets.join(", ")} where slug = $1`, params);
      if (r.rowCount === 0) throw new AdminError(404, "NOT_FOUND", "Categoria não encontrada.");
    },

    // ----- Partidas e estatísticas -----
    async listGames(page = 1) {
      const { rows } = await pool.query(
        `select g.id, r.code, g.humor_level, g.started_at, g.ended_at, g.end_reason, g.total_rounds,
                (select count(*)::int from public.rounds x where x.game_id = g.id) as rounds,
                (select count(distinct s.player_id)::int from public.submissions s join public.rounds x on x.id = s.round_id where x.game_id = g.id) as players,
                (select gp.nickname from public.game_players gp where gp.game_id = g.id and gp.user_id = g.winner_id) as winner
         from public.games g join public.rooms r on r.id = g.room_id
         order by g.started_at desc limit 50 offset $1`,
        [(Math.max(1, page) - 1) * 50],
      );
      return rows.map((r) => ({
        id: r.id,
        code: r.code,
        humorLevel: r.humor_level,
        startedAt: r.started_at.toISOString(),
        endedAt: r.ended_at?.toISOString() ?? null,
        endReason: r.end_reason,
        rounds: r.rounds,
        players: r.players,
        winner: r.winner,
      }));
    },

    async stats() {
      const one = async <T>(sql: string): Promise<T> => (await pool.query(sql)).rows[0] as T;
      const [games, live, cards] = await Promise.all([
        one<{ today: number; week: number; finished_week: number; avg_minutes: number | null; players_week: number; rounds_week: number }>(`
          select
            count(*) filter (where started_at >= date_trunc('day', now()))::int as today,
            count(*) filter (where started_at >= now() - interval '7 days')::int as week,
            count(*) filter (where started_at >= now() - interval '7 days' and end_reason in ('points', 'rounds'))::int as finished_week,
            round(avg(extract(epoch from ended_at - started_at) / 60) filter (where end_reason in ('points', 'rounds')))::int as avg_minutes,
            (select count(distinct s.player_id)::int from public.submissions s where s.submitted_at >= now() - interval '7 days') as players_week,
            (select count(*)::int from public.rounds where started_at >= now() - interval '7 days') as rounds_week
          from public.games`),
        one<{ rooms_now: number; playing_now: number }>(`
          select count(*)::int as rooms_now, count(*) filter (where status = 'playing')::int as playing_now
          from public.rooms where status <> 'closed' and last_activity_at > now() - interval '10 minutes'`),
        one<{ black_active: number; white_active: number }>(`
          select (select count(*)::int from public.black_cards where status = 'active') as black_active,
                 (select count(*)::int from public.white_cards where status = 'active') as white_active`),
      ]);
      const top = await pool.query(`
        select w.id, w.text, w.humor_level, count(*)::int as plays, count(*) filter (where r.winning_submission_id = s.id)::int as wins
        from public.white_cards w
        join public.submissions s on s.white_card_ids @> array[w.id]
        join public.rounds r on r.id = s.round_id
        group by w.id having count(*) >= 3
        order by (count(*) filter (where r.winning_submission_id = s.id))::float / count(*) desc, count(*) desc
        limit 10`);
      const flop = await pool.query(`
        select w.id, w.text, w.humor_level, count(*)::int as plays, count(*) filter (where r.winning_submission_id = s.id)::int as wins
        from public.white_cards w
        join public.submissions s on s.white_card_ids @> array[w.id]
        join public.rounds r on r.id = s.round_id
        where w.status = 'active'
        group by w.id having count(*) >= 5 and count(*) filter (where r.winning_submission_id = s.id) = 0
        order by count(*) desc limit 10`);
      const card = (r: { id: string; text: string; humor_level: number; plays: number; wins: number }) => ({ id: r.id, text: r.text, humorLevel: r.humor_level, plays: r.plays, wins: r.wins });
      return {
        gamesToday: games.today,
        gamesWeek: games.week,
        completionRate: games.week ? Math.round((games.finished_week / games.week) * 100) : null,
        avgMinutes: games.avg_minutes,
        playersWeek: games.players_week,
        roundsWeek: games.rounds_week,
        roomsNow: live.rooms_now,
        playingNow: live.playing_now,
        activeBlack: cards.black_active,
        activeWhite: cards.white_active,
        topCards: top.rows.map(card),
        neverWinning: flop.rows.map(card),
      };
    },

    // ----- Equipe -----
    async rolesOf(userId: string): Promise<Role[]> {
      const { rows } = await pool.query<{ role: Role }>("select role from public.user_roles where user_id = $1", [userId]);
      return rows.map((r) => r.role);
    },

    async listStaff() {
      const { rows } = await pool.query(
        `select u.id, u.email, array_agg(ur.role order by ur.role) as roles, min(ur.granted_at) as since
         from public.user_roles ur join auth.users u on u.id = ur.user_id
         group by u.id, u.email order by min(ur.granted_at)`,
      );
      return rows.map((r) => ({ id: r.id, email: r.email, roles: r.roles as Role[], since: r.since.toISOString() }));
    },

    async grantRole(email: string, role: Role) {
      const { rows } = await pool.query<{ id: string }>("select id from auth.users where lower(email) = lower($1)", [email]);
      if (!rows[0]) {
        throw new AdminError(404, "USER_NOT_FOUND", "Não há conta com esse e-mail. Crie o usuário no painel do Supabase (Authentication > Users) e tente de novo.");
      }
      await pool.query("insert into public.user_roles (user_id, role) values ($1, $2) on conflict do nothing", [rows[0].id, role]);
    },

    async revokeRole(userId: string, role: Role, actorId: string) {
      if (role === "admin") {
        const { rows } = await pool.query<{ n: number }>("select count(*)::int as n from public.user_roles where role = 'admin'");
        if (rows[0]!.n <= 1) throw new AdminError(409, "LAST_ADMIN", "Não dá para remover o último administrador.");
        if (userId === actorId) throw new AdminError(409, "SELF_DEMOTE", "Peça para outro administrador remover o seu acesso.");
      }
      await pool.query("delete from public.user_roles where user_id = $1 and role = $2", [userId, role]);
    },
  };
}

export type AdminStore = ReturnType<typeof createAdminStore>;
