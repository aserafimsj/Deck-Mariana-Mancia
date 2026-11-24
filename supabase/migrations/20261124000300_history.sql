-- Scragbadum! — histórico e estatísticas
-- Salas fechadas por inatividade encerram também a partida em andamento (como "abandonada"),
-- e índices para as estatísticas de cartas do painel administrativo.

create or replace function public.close_inactive_rooms(p_idle interval default interval '2 hours')
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  with closed as (
    update public.rooms
    set status = 'closed', closed_at = now()
    where status <> 'closed' and last_activity_at < now() - p_idle
    returning id
  ), ended as (
    update public.games g
    set ended_at = now(), end_reason = 'abandoned'
    where g.ended_at is null and g.room_id in (select id from closed)
    returning g.id
  )
  select count(*) into v_count from closed;
  return v_count;
end;
$$;

revoke all on function public.close_inactive_rooms(interval) from public, anon, authenticated;
grant execute on function public.close_inactive_rooms(interval) to service_role;

-- Uma partida aberta por sala (a mais recente é a atual).
create index games_open_idx on public.games (room_id, started_at desc) where ended_at is null;
-- "Em quantas respostas esta carta apareceu?"
create index submissions_cards_gin on public.submissions using gin (white_card_ids);
create index rounds_black_card_idx on public.rounds (black_card_id);
