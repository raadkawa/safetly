-- Safetly: push-varsler (også når appen er lukket).
-- Kjør denne i SQL Editor. Kan kjøres flere ganger.
-- Krever at varslingstjenesten (supabase/functions/push) er installert, se README.

-- Telefoner som har slått på varsler. Én rad per telefon/nettleser.
create table if not exists public.push_subscriptions (
  endpoint    text primary key check (char_length(endpoint) between 10 and 1000),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  p256dh      text not null check (char_length(p256dh) < 200),
  auth        text not null check (char_length(auth) < 100),
  created_at  timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;

drop policy if exists "push_select" on public.push_subscriptions;
create policy "push_select" on public.push_subscriptions
  for select to authenticated using (user_id = auth.uid());
drop policy if exists "push_delete" on public.push_subscriptions;
create policy "push_delete" on public.push_subscriptions
  for delete to authenticated using (user_id = auth.uid());

-- Lagre (eller flytte) en telefon til den som er logget inn. Bytter man konto på samme telefon, flyttes varslene.
create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Ikke logget inn'; end if;
  insert into public.push_subscriptions (endpoint, user_id, p256dh, auth)
  values (p_endpoint, auth.uid(), p_p256dh, p_auth)
  on conflict (endpoint) do update set user_id = auth.uid(), p256dh = excluded.p256dh, auth = excluded.auth, created_at = now();
end;
$$;
revoke all on function public.save_push_subscription(text, text, text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text) to authenticated;

-- Hvilke varsler hver bruker vil ha.
alter table public.profiles add column if not exists notify jsonb not null
  default '{"meldinger": true, "alle": true, "nyheter": true, "vakt": true, "mangler": true}';

-- Nøkler og logg for varslingstjenesten. Bare tjenesten selv (service role) har tilgang.
create table if not exists public.push_config (
  id           int primary key check (id = 1),
  public_key   text not null,
  private_key  text not null
);
create table if not exists public.push_log (
  key         text primary key,
  created_at  timestamptz not null default now()
);
alter table public.push_config enable row level security;
alter table public.push_log    enable row level security;
revoke all on public.push_config, public.push_log from anon, authenticated;

revoke all on public.push_subscriptions from anon;
grant select, delete on public.push_subscriptions to authenticated;

-- Varslingstjenesten (service_role) må kunne lese og skrive det den trenger.
grant select, insert, update, delete on public.push_config, public.push_log, public.push_subscriptions to service_role;
grant select on public.profiles, public.messages, public.news, public.bookings, public.settings to service_role;

-- Påminnelser før vakt og «mangler folk» sjekkes hvert 10. minutt.
create extension if not exists pg_net;
create extension if not exists pg_cron;
do $$
begin
  if exists (select 1 from cron.job where jobname = 'safetly-varsler') then
    perform cron.unschedule('safetly-varsler');
  end if;
end $$;
select cron.schedule(
  'safetly-varsler',
  '*/10 * * * *',
  $job$ select net.http_post(
    url := 'https://ptbyychbijspnchxtkzd.supabase.co/functions/v1/push',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{"type": "cron"}'::jsonb
  ) $job$
);
