-- Scragbadum! — esquema inicial
-- Grupos: identidade · conteúdo (cartas) · sala ao vivo · estado da partida · histórico
-- Regra de ouro: clientes nunca escrevem em tabelas de jogo. Toda escrita passa pelo servidor
-- (chave de serviço). As políticas de RLS estão em 20261124000200_rls.sql.

-- ---------------------------------------------------------------------------
-- Utilitários
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Identidade
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (display_name is null or char_length(display_name) between 2 and 16),
  is_anonymous boolean not null default true,
  created_at timestamptz not null default now()
);
comment on table public.profiles is 'Um perfil por usuário do Supabase Auth (anônimo ou permanente).';

create table public.user_roles (
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('admin', 'editor')),
  granted_at timestamptz not null default now(),
  primary key (user_id, role)
);
comment on table public.user_roles is 'admin: tudo no painel. editor: só conteúdo (cartas, categorias, baralhos).';

-- Cria o perfil automaticamente quando alguém entra (inclusive login anônimo).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, is_anonymous)
  values (new.id, coalesce(new.is_anonymous, false))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Conteúdo
-- ---------------------------------------------------------------------------
create table public.decks (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,40}$'),
  name text not null check (char_length(name) between 2 and 60),
  description text check (description is null or char_length(description) <= 280),
  is_free boolean not null default true,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.decks is 'Pacote de cartas. O baralho base é gratuito; pacotes futuros entram aqui.';

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,40}$'),
  name text not null check (char_length(name) between 2 and 40),
  color text check (color is null or color ~ '^#[0-9A-Fa-f]{6}$'),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.black_cards (
  id uuid primary key default gen_random_uuid(),
  deck_id uuid not null references public.decks (id) on delete restrict,
  category_id uuid references public.categories (id) on delete set null,
  text text not null check (char_length(text) between 3 and 200),
  pick smallint not null default 1 check (pick in (1, 2)),
  humor_level smallint not null default 2 check (humor_level between 1 and 4),
  status text not null default 'active' check (status in ('draft', 'active', 'archived')),
  author_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on column public.black_cards.text is 'Lacunas são marcadas com ___ (três sublinhados).';
comment on column public.black_cards.status is 'Cartas já usadas são arquivadas, nunca apagadas, para preservar o histórico.';

create table public.white_cards (
  id uuid primary key default gen_random_uuid(),
  deck_id uuid not null references public.decks (id) on delete restrict,
  category_id uuid references public.categories (id) on delete set null,
  text text not null check (char_length(text) between 2 and 140),
  humor_level smallint not null default 2 check (humor_level between 1 and 4),
  status text not null default 'active' check (status in ('draft', 'active', 'archived')),
  author_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index black_cards_deck_text_uidx on public.black_cards (deck_id, lower(text));
create unique index white_cards_deck_text_uidx on public.white_cards (deck_id, lower(text));
create index black_cards_draw_idx on public.black_cards (deck_id, humor_level) where status = 'active';
create index white_cards_draw_idx on public.white_cards (deck_id, humor_level) where status = 'active';

create trigger decks_updated_at before update on public.decks for each row execute function public.set_updated_at();
create trigger categories_updated_at before update on public.categories for each row execute function public.set_updated_at();
create trigger black_cards_updated_at before update on public.black_cards for each row execute function public.set_updated_at();
create trigger white_cards_updated_at before update on public.white_cards for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Sala ao vivo
-- ---------------------------------------------------------------------------
create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  -- Alfabeto sem caracteres ambíguos (sem 0, 1, I, L, O)
  code text not null check (code ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}$'),
  host_id uuid not null references public.profiles (id) on delete restrict,
  status text not null default 'lobby' check (status in ('lobby', 'playing', 'finished', 'closed')),
  visibility text not null default 'private' check (visibility in ('private', 'public')),
  humor_level smallint not null default 2 check (humor_level between 1 and 4),
  settings jsonb not null default '{}'::jsonb,
  locked boolean not null default false,
  created_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  closed_at timestamptz,
  constraint rooms_public_never_level4 check (not (visibility = 'public' and humor_level = 4)),
  constraint rooms_closed_at_matches_status check ((status = 'closed') = (closed_at is not null))
);
-- O código só precisa ser único entre salas abertas; pode ser reaproveitado depois.
create unique index rooms_code_open_uidx on public.rooms (code) where status <> 'closed';
create index rooms_activity_idx on public.rooms (last_activity_at) where status <> 'closed';

create table public.room_players (
  room_id uuid not null references public.rooms (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  nickname text not null check (char_length(nickname) between 2 and 16),
  seat smallint not null check (seat >= 0),
  status text not null default 'active' check (status in ('active', 'left', 'kicked')),
  accepted_level4_at timestamptz,
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (room_id, user_id)
);
create unique index room_players_nickname_uidx on public.room_players (room_id, lower(nickname)) where status = 'active';
create unique index room_players_seat_uidx on public.room_players (room_id, seat);
create index room_players_user_idx on public.room_players (user_id);

-- ---------------------------------------------------------------------------
-- Estado autoritativo da partida (somente servidor)
-- ---------------------------------------------------------------------------
create table public.game_states (
  room_id uuid primary key references public.rooms (id) on delete cascade,
  version integer not null check (version >= 1),
  state jsonb not null,
  updated_at timestamptz not null default now()
);
comment on table public.game_states is 'Estado completo (inclui mãos e baralho). Nenhuma política de leitura: só a chave de serviço acessa.';

create table public.game_actions (
  id bigint generated always as identity primary key,
  room_id uuid not null references public.rooms (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  client_action_id uuid not null,
  type text not null check (char_length(type) between 1 and 40),
  payload jsonb not null default '{}'::jsonb,
  result_version integer not null,
  created_at timestamptz not null default now(),
  unique (room_id, client_action_id)
);
comment on table public.game_actions is 'Log de auditoria e chave de idempotência das ações.';

-- Grava uma transição de estado de forma atômica:
--   * idempotente por client_action_id (reenvio devolve 'duplicate' e a versão original);
--   * controle otimista de versão (versão esperada diferente devolve 'conflict').
-- p_expected_version = 0 cria o estado inicial.
create or replace function public.commit_game_transition(
  p_room_id uuid,
  p_expected_version integer,
  p_state jsonb,
  p_actor_id uuid,
  p_client_action_id uuid,
  p_action_type text,
  p_payload jsonb default '{}'::jsonb
)
returns table (out_status text, out_version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing integer;
  v_new integer;
begin
  select ga.result_version into v_existing
  from public.game_actions ga
  where ga.room_id = p_room_id and ga.client_action_id = p_client_action_id;

  if found then
    return query select 'duplicate'::text, v_existing;
    return;
  end if;

  if p_expected_version = 0 then
    insert into public.game_states as gs (room_id, version, state)
    values (p_room_id, 1, p_state)
    on conflict (room_id) do nothing
    returning gs.version into v_new;
  else
    update public.game_states as gs
    set state = p_state, version = gs.version + 1, updated_at = now()
    where gs.room_id = p_room_id and gs.version = p_expected_version
    returning gs.version into v_new;
  end if;

  if v_new is null then
    return query
      select 'conflict'::text, (select gs.version from public.game_states gs where gs.room_id = p_room_id);
    return;
  end if;

  insert into public.game_actions (room_id, actor_id, client_action_id, type, payload, result_version)
  values (p_room_id, p_actor_id, p_client_action_id, p_action_type, coalesce(p_payload, '{}'::jsonb), v_new);

  update public.rooms set last_activity_at = now() where id = p_room_id;

  return query select 'ok'::text, v_new;
end;
$$;

-- Fecha salas sem atividade. Agendada via pg_cron em produção (ver README).
create or replace function public.close_inactive_rooms(p_idle interval default interval '2 hours')
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.rooms
  set status = 'closed', closed_at = now()
  where status <> 'closed' and last_activity_at < now() - p_idle;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Histórico e estatísticas (escrito pelo servidor ao longo da partida)
-- ---------------------------------------------------------------------------
create table public.games (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  settings_snapshot jsonb not null,
  humor_level smallint not null check (humor_level between 1 and 4),
  winner_id uuid references public.profiles (id) on delete set null,
  total_rounds integer not null default 0 check (total_rounds >= 0),
  end_reason text check (end_reason in ('points', 'rounds', 'abandoned')),
  started_at timestamptz not null default now(),
  ended_at timestamptz
);
create index games_room_idx on public.games (room_id);
create index games_started_idx on public.games (started_at);

create table public.game_players (
  game_id uuid not null references public.games (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  nickname text not null,
  score integer not null default 0 check (score >= 0),
  rounds_won integer not null default 0 check (rounds_won >= 0),
  final_rank smallint check (final_rank is null or final_rank >= 1),
  primary key (game_id, user_id)
);

create table public.rounds (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  number integer not null check (number >= 1),
  judge_id uuid references public.profiles (id) on delete set null,
  black_card_id uuid not null references public.black_cards (id) on delete restrict,
  winning_submission_id uuid,
  end_reason text check (end_reason in ('judged', 'timeout', 'judge_left', 'cancelled')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  unique (game_id, number)
);

create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.rounds (id) on delete cascade,
  player_id uuid references public.profiles (id) on delete set null,
  white_card_ids uuid[] not null check (array_length(white_card_ids, 1) between 1 and 2),
  reveal_order smallint,
  submitted_at timestamptz not null default now(),
  unique (round_id, player_id),
  unique (id, round_id)
);

-- A resposta vencedora precisa pertencer à mesma rodada.
alter table public.rounds
  add constraint rounds_winner_same_round_fk
  foreign key (winning_submission_id, id) references public.submissions (id, round_id)
  deferrable initially deferred;
