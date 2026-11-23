-- Scragbadum! — políticas de acesso (Row Level Security)
-- Princípio: jogadores só leem o mínimo e não escrevem nada diretamente.
-- O servidor usa a chave de serviço (service_role), que ignora RLS.

-- ---------------------------------------------------------------------------
-- Funções auxiliares (security definer para evitar recursão de RLS)
-- ---------------------------------------------------------------------------
create or replace function public.has_role(p_role text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid() and ur.role = p_role
  );
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid() and ur.role in ('admin', 'editor')
  );
$$;

create or replace function public.is_room_member(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.room_players rp
    where rp.room_id = p_room_id and rp.user_id = auth.uid() and rp.status = 'active'
  );
$$;

-- ---------------------------------------------------------------------------
-- Ativar RLS em todas as tabelas
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.decks enable row level security;
alter table public.categories enable row level security;
alter table public.black_cards enable row level security;
alter table public.white_cards enable row level security;
alter table public.rooms enable row level security;
alter table public.room_players enable row level security;
alter table public.game_states enable row level security;
alter table public.game_actions enable row level security;
alter table public.games enable row level security;
alter table public.game_players enable row level security;
alter table public.rounds enable row level security;
alter table public.submissions enable row level security;

-- ---------------------------------------------------------------------------
-- Identidade
-- ---------------------------------------------------------------------------
create policy profiles_select_own_or_staff on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_staff());

create policy user_roles_select_own_or_admin on public.user_roles
  for select to authenticated
  using (user_id = auth.uid() or public.has_role('admin'));

create policy user_roles_admin_insert on public.user_roles
  for insert to authenticated
  with check (public.has_role('admin'));

create policy user_roles_admin_delete on public.user_roles
  for delete to authenticated
  using (public.has_role('admin'));

-- ---------------------------------------------------------------------------
-- Conteúdo: só a equipe (admin/editor) lê e edita pelo cliente.
-- O jogo carrega as cartas no servidor; jogadores recebem só as da própria mão.
-- ---------------------------------------------------------------------------
create policy decks_staff_select on public.decks for select to authenticated using (public.is_staff());
create policy decks_staff_insert on public.decks for insert to authenticated with check (public.is_staff());
create policy decks_staff_update on public.decks for update to authenticated using (public.is_staff()) with check (public.is_staff());
create policy decks_admin_delete on public.decks for delete to authenticated using (public.has_role('admin'));

create policy categories_staff_select on public.categories for select to authenticated using (public.is_staff());
create policy categories_staff_insert on public.categories for insert to authenticated with check (public.is_staff());
create policy categories_staff_update on public.categories for update to authenticated using (public.is_staff()) with check (public.is_staff());
create policy categories_admin_delete on public.categories for delete to authenticated using (public.has_role('admin'));

create policy black_cards_staff_select on public.black_cards for select to authenticated using (public.is_staff());
create policy black_cards_staff_insert on public.black_cards for insert to authenticated with check (public.is_staff());
create policy black_cards_staff_update on public.black_cards for update to authenticated using (public.is_staff()) with check (public.is_staff());
create policy black_cards_admin_delete on public.black_cards for delete to authenticated using (public.has_role('admin'));

create policy white_cards_staff_select on public.white_cards for select to authenticated using (public.is_staff());
create policy white_cards_staff_insert on public.white_cards for insert to authenticated with check (public.is_staff());
create policy white_cards_staff_update on public.white_cards for update to authenticated using (public.is_staff()) with check (public.is_staff());
create policy white_cards_admin_delete on public.white_cards for delete to authenticated using (public.has_role('admin'));

-- ---------------------------------------------------------------------------
-- Sala ao vivo: membros ativos veem a sala e a lista de jogadores (dados não secretos).
-- ---------------------------------------------------------------------------
create policy rooms_member_select on public.rooms
  for select to authenticated
  using (public.is_room_member(id) or public.is_staff());

create policy room_players_member_select on public.room_players
  for select to authenticated
  using (public.is_room_member(room_id) or public.is_staff());

-- ---------------------------------------------------------------------------
-- game_states e game_actions: sem políticas = nenhum acesso para anon/authenticated.
-- Histórico: só a equipe consulta (histórico pessoal fica para a Fase 2).
-- ---------------------------------------------------------------------------
create policy games_staff_select on public.games for select to authenticated using (public.is_staff());
create policy game_players_staff_select on public.game_players for select to authenticated using (public.is_staff());
create policy rounds_staff_select on public.rounds for select to authenticated using (public.is_staff());
create policy submissions_staff_select on public.submissions for select to authenticated using (public.is_staff());

-- ---------------------------------------------------------------------------
-- Funções exclusivas do servidor
-- ---------------------------------------------------------------------------
revoke all on function public.commit_game_transition(uuid, integer, jsonb, uuid, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.commit_game_transition(uuid, integer, jsonb, uuid, uuid, text, jsonb) to service_role;

revoke all on function public.close_inactive_rooms(interval) from public, anon, authenticated;
grant execute on function public.close_inactive_rooms(interval) to service_role;

revoke all on function public.handle_new_user() from public, anon, authenticated;
