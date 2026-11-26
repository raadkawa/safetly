-- Safetly: blokkere og rapportere i meldinger (krav fra Apple og Google for apper der brukere skriver til hverandre).
-- Kjør denne i SQL Editor etter lag.sql. Kan kjøres flere ganger.

-- Blokkering: den du blokkerer kan ikke sende deg meldinger, og du ser ikke meldingene deres.
create table if not exists public.blocks (
  user_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  blocked_id  uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, blocked_id),
  check (user_id <> blocked_id)
);
alter table public.blocks enable row level security;
drop policy if exists "blocks_select" on public.blocks;
create policy "blocks_select" on public.blocks for select to authenticated using (user_id = auth.uid());
drop policy if exists "blocks_insert" on public.blocks;
create policy "blocks_insert" on public.blocks for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "blocks_delete" on public.blocks;
create policy "blocks_delete" on public.blocks for delete to authenticated using (user_id = auth.uid());

-- Har mottakeren blokkert meg?
create or replace function public.is_blocked_by(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.blocks where user_id = p_user and blocked_id = auth.uid());
$$;
revoke all on function public.is_blocked_by(uuid) from public, anon;
grant execute on function public.is_blocked_by(uuid) to authenticated;

-- Rapporter: en melding eller en person. Administrator ser og behandler rapportene.
create table if not exists public.content_reports (
  id             uuid primary key default gen_random_uuid(),
  reporter_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  message_id     uuid references public.messages (id) on delete set null,
  reported_user  uuid references public.profiles (id) on delete cascade,
  message_text   text not null default '' check (char_length(message_text) <= 1000),
  reason         text not null default '' check (char_length(reason) <= 500),
  status         text not null default 'ny' check (status in ('ny', 'behandlet')),
  created_at     timestamptz not null default now()
);
alter table public.content_reports enable row level security;
drop policy if exists "creports_select" on public.content_reports;
create policy "creports_select" on public.content_reports for select to authenticated
  using (reporter_id = auth.uid() or public.is_admin());
drop policy if exists "creports_insert" on public.content_reports;
create policy "creports_insert" on public.content_reports for insert to authenticated
  with check (reporter_id = auth.uid());
drop policy if exists "creports_update" on public.content_reports;
create policy "creports_update" on public.content_reports for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists "creports_delete" on public.content_reports;
create policy "creports_delete" on public.content_reports for delete to authenticated using (public.is_admin());

-- Meldinger: blokkerte kan ikke sende deg direktemeldinger.
drop policy if exists "messages_insert" on public.messages;
create policy "messages_insert" on public.messages
  for insert to authenticated
  with check (
    sender_id = auth.uid()
    and (recipient_id is not null or public.is_coordinator())
    and (recipient_id is null or not public.is_blocked_by(recipient_id))
  );
-- Administrator kan slette meldinger som er rapportert.
drop policy if exists "messages_delete" on public.messages;
create policy "messages_delete" on public.messages
  for delete to authenticated
  using (
    sender_id = auth.uid()
    or (recipient_id is null and public.is_coordinator())
    or (public.is_admin() and exists (select 1 from public.content_reports r where r.message_id = messages.id))
  );

revoke all on public.blocks, public.content_reports from anon;
grant select, insert, delete on public.blocks to authenticated;
grant select, insert, update, delete on public.content_reports to authenticated;
grant select on public.blocks to service_role;
grant select, delete on public.messages to service_role;
