-- Safetly: oppmøtested som koordinatorer kan endre i appen.
-- Kjør denne i SQL Editor hvis du allerede har kjørt schema.sql. Kan kjøres flere ganger.

create table if not exists public.settings (
  id               int primary key default 1 check (id = 1),
  meeting_name     text not null default '' check (char_length(meeting_name) <= 120),
  meeting_address  text not null default '' check (char_length(meeting_address) <= 200),
  meeting_note     text not null default '' check (char_length(meeting_note) <= 500),
  updated_at       timestamptz not null default now()
);
insert into public.settings (id) values (1) on conflict (id) do nothing;

alter table public.settings enable row level security;

drop policy if exists "settings_select" on public.settings;
create policy "settings_select" on public.settings
  for select to authenticated using (true);
drop policy if exists "settings_update" on public.settings;
create policy "settings_update" on public.settings
  for update to authenticated using (public.is_coordinator()) with check (public.is_coordinator());

revoke all on public.settings from anon;
grant select, update on public.settings to authenticated;
