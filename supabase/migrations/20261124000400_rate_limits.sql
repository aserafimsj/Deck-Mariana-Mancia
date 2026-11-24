-- Scragbadum! — limite de requisições compartilhado entre todas as instâncias do servidor.
-- Usado em ações que atraem abuso (criar sala, entrar em sala). Janela fixa por chave.

create table public.rate_limits (
  key text primary key check (char_length(key) <= 200),
  window_start timestamptz not null,
  hits integer not null
);
alter table public.rate_limits enable row level security; -- sem políticas: só o servidor acessa

-- Conta uma tentativa e diz se ainda está dentro do limite. Atômico (uma instrução).
create or replace function public.hit_rate_limit(p_key text, p_limit integer, p_window_seconds integer)
returns boolean
language sql
security definer
set search_path = ''
as $$
  insert into public.rate_limits as rl (key, window_start, hits)
  values (p_key, now(), 1)
  on conflict (key) do update set
    window_start = case when rl.window_start < now() - make_interval(secs => p_window_seconds) then now() else rl.window_start end,
    hits = case when rl.window_start < now() - make_interval(secs => p_window_seconds) then 1 else rl.hits + 1 end
  returning hits <= p_limit;
$$;

-- Limpeza de janelas antigas (agendar junto com close_inactive_rooms; ver README).
create or replace function public.purge_rate_limits()
returns integer
language sql
security definer
set search_path = ''
as $$
  with d as (delete from public.rate_limits where window_start < now() - interval '1 day' returning 1)
  select count(*)::integer from d;
$$;

revoke all on function public.hit_rate_limit(text, integer, integer) from public, anon, authenticated;
revoke all on function public.purge_rate_limits() from public, anon, authenticated;
grant execute on function public.hit_rate_limit(text, integer, integer) to service_role;
grant execute on function public.purge_rate_limits() to service_role;
