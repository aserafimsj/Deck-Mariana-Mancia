import pg from "pg";
import type { CardPool, GameState } from "@/engine";
import type { HumorLevel } from "@/lib/game-config";

/**
 * Acesso ao banco para o servidor do jogo. Usa conexão direta com o Postgres
 * (em produção, a URL do "transaction pooler" do Supabase), com papel que ignora RLS.
 * O mesmo código roda nos testes contra um Postgres local.
 */

export type RoomRow = { id: string; code: string; status: string };
export type CommitResult = { status: "ok" | "conflict" | "duplicate"; version: number };

export class CodeTakenError extends Error {}

export interface Store {
  createRoom(input: { code: string; hostId: string; nickname: string; state: GameState }): Promise<RoomRow>;
  getOpenRoom(code: string): Promise<RoomRow | null>;
  loadState(roomId: string): Promise<{ version: number; state: GameState } | null>;
  commit(input: {
    roomId: string;
    expectedVersion: number;
    state: GameState;
    actorId: string | null;
    clientActionId: string;
    type: string;
    payload: unknown;
  }): Promise<CommitResult>;
  /** Versão gravada por uma ação já processada (reenvio), ou null. */
  processedAction(roomId: string, clientActionId: string): Promise<number | null>;
  /** Copia para as tabelas visíveis (rooms, room_players) o que não é secreto. */
  syncRoom(roomId: string, state: GameState): Promise<void>;
  /** Registra que o jogador deu sinal de vida agora. */
  touch(roomId: string, userId: string): Promise<void>;
  /** Jogadores que pararam de dar sinal de vida há mais de `ms`. */
  silentPlayers(roomId: string, ms: number): Promise<string[]>;
  loadCards(level: HumorLevel, categorySlugs: string[]): Promise<CardPool>;
  ensureAuthUser(id: string): Promise<void>;
}

const UNIQUE_VIOLATION = "23505";

export function createPgStore(pool: pg.Pool): Store {
  return {
    async createRoom({ code, hostId, nickname, state }) {
      const client = await pool.connect();
      try {
        await client.query("begin");
        const room = await client.query<RoomRow>(
          `insert into public.rooms (code, host_id, humor_level, settings)
           values ($1, $2, $3, $4) returning id, code, status`,
          [code, hostId, state.settings.humorLevel, JSON.stringify(state.settings)],
        );
        const roomId = room.rows[0]!.id;
        await client.query(
          `insert into public.room_players (room_id, user_id, nickname, seat, accepted_level4_at)
           values ($1, $2, $3, 0, case when $4 then now() end)`,
          [roomId, hostId, nickname, state.settings.humorLevel === 4],
        );
        await client.query("insert into public.game_states (room_id, version, state) values ($1, 1, $2)", [roomId, JSON.stringify(state)]);
        await client.query("commit");
        return room.rows[0]!;
      } catch (error) {
        await client.query("rollback").catch(() => undefined);
        const e = error as { code?: string; constraint?: string };
        if (e.code === UNIQUE_VIOLATION && e.constraint === "rooms_code_open_uidx") throw new CodeTakenError();
        throw error;
      } finally {
        client.release();
      }
    },

    async getOpenRoom(code) {
      const { rows } = await pool.query<RoomRow>("select id, code, status from public.rooms where code = $1 and status <> 'closed'", [code]);
      return rows[0] ?? null;
    },

    async loadState(roomId) {
      const { rows } = await pool.query<{ version: number; state: GameState }>("select version, state from public.game_states where room_id = $1", [roomId]);
      return rows[0] ?? null;
    },

    async commit({ roomId, expectedVersion, state, actorId, clientActionId, type, payload }) {
      const { rows } = await pool.query<{ out_status: CommitResult["status"]; out_version: number }>(
        "select * from public.commit_game_transition($1, $2, $3, $4, $5, $6, $7)",
        [roomId, expectedVersion, JSON.stringify(state), actorId, clientActionId, type, JSON.stringify(payload ?? {})],
      );
      return { status: rows[0]!.out_status, version: rows[0]!.out_version };
    },

    async processedAction(roomId, clientActionId) {
      const { rows } = await pool.query<{ result_version: number }>(
        "select result_version from public.game_actions where room_id = $1 and client_action_id = $2",
        [roomId, clientActionId],
      );
      return rows[0]?.result_version ?? null;
    },

    async syncRoom(roomId, state) {
      const status = state.phase === "lobby" ? "lobby" : state.phase === "game_over" ? "finished" : "playing";
      const players = Object.values(state.players).map((p) => ({
        user_id: p.id,
        nickname: p.nickname,
        seat: p.seat,
        status: p.status,
        accepted_level4: p.acceptedLevel4,
      }));
      const client = await pool.connect();
      try {
        await client.query("begin");
        await client.query("update public.rooms set host_id = $2, status = $3, humor_level = $4, settings = $5 where id = $1", [
          roomId,
          state.hostId,
          status,
          state.settings.humorLevel,
          JSON.stringify(state.settings),
        ]);
        // Libera apelidos de quem saiu antes de gravar os ativos (o índice de apelido vale só para ativos).
        await client.query(
          `update public.room_players rp set status = x.status
           from jsonb_to_recordset($2::jsonb) as x(user_id uuid, status text)
           where rp.room_id = $1 and rp.user_id = x.user_id and x.status <> 'active'`,
          [roomId, JSON.stringify(players)],
        );
        await client.query(
          `insert into public.room_players (room_id, user_id, nickname, seat, status, accepted_level4_at)
           select $1, x.user_id, x.nickname, x.seat, x.status, case when x.accepted_level4 then now() end
           from jsonb_to_recordset($2::jsonb) as x(user_id uuid, nickname text, seat smallint, status text, accepted_level4 boolean)
           on conflict (room_id, user_id) do update set
             nickname = excluded.nickname,
             status = excluded.status,
             accepted_level4_at = coalesce(public.room_players.accepted_level4_at, excluded.accepted_level4_at)`,
          [roomId, JSON.stringify(players)],
        );
        await client.query("commit");
      } catch (error) {
        await client.query("rollback").catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    },

    async touch(roomId, userId) {
      await pool.query("update public.room_players set last_seen_at = now() where room_id = $1 and user_id = $2", [roomId, userId]);
    },

    async silentPlayers(roomId, ms) {
      const { rows } = await pool.query<{ user_id: string }>(
        `select user_id from public.room_players
         where room_id = $1 and status = 'active' and last_seen_at < now() - make_interval(secs => $2::double precision / 1000)`,
        [roomId, ms],
      );
      return rows.map((r) => r.user_id);
    },

    async loadCards(level, categorySlugs) {
      const params = [level, categorySlugs];
      const filter = `d.is_active and d.is_free and x.status = 'active' and x.humor_level <= $1
        and (cardinality($2::text[]) = 0 or c.slug = any($2::text[]))`;
      const black = await pool.query<{ id: string; text: string; pick: 1 | 2; humor_level: HumorLevel }>(
        `select x.id, x.text, x.pick, x.humor_level from public.black_cards x
         join public.decks d on d.id = x.deck_id left join public.categories c on c.id = x.category_id
         where ${filter}`,
        params,
      );
      const white = await pool.query<{ id: string; text: string; humor_level: HumorLevel }>(
        `select x.id, x.text, x.humor_level from public.white_cards x
         join public.decks d on d.id = x.deck_id left join public.categories c on c.id = x.category_id
         where ${filter}`,
        params,
      );
      return {
        black: black.rows.map((r) => ({ id: r.id, text: r.text, pick: r.pick, humorLevel: r.humor_level })),
        white: white.rows.map((r) => ({ id: r.id, text: r.text, humorLevel: r.humor_level })),
      };
    },

    async ensureAuthUser(id) {
      await pool.query("insert into auth.users (id, is_anonymous) values ($1, true) on conflict (id) do nothing", [id]);
    },
  };
}

/**
 * TLS da conexão. Localmente não há TLS. No Supabase, o certificado é emitido pela CA do próprio
 * Supabase: com SUPABASE_DB_CA_CERT (o PEM baixado em Database Settings) o certificado é verificado.
 * Sem ele, a conexão é cifrada mas sem verificar o certificado (pendência registrada para a Etapa 8).
 */
function sslConfig(url: string): pg.PoolConfig["ssl"] {
  if (/@(localhost|127\.0\.0\.1)[:/]/.test(url)) return undefined;
  const ca = process.env.SUPABASE_DB_CA_CERT;
  return ca ? { ca: ca.replace(/\\n/g, "\n"), rejectUnauthorized: true } : { rejectUnauthorized: false };
}

let pool: pg.Pool | null = null;

/** Pool único por instância do servidor. */
export function getPool(url: string): pg.Pool {
  if (!pool) {
    pool = new pg.Pool({
      connectionString: url,
      max: 3,
      idleTimeoutMillis: 10_000,
      ssl: sslConfig(url),
    });
  }
  return pool;
}
