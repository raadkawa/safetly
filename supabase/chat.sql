-- Safetly: meldinger (chat). Kjør denne i SQL Editor hvis du allerede har kjørt schema.sql.
-- Kan kjøres flere ganger.
--   * recipient_id = tom  -> «Til alle». Bare koordinatorer kan skrive, alle innloggede kan lese.
--   * recipient_id = noen -> melding til én person. Bare avsender og mottaker kan lese.

create table if not exists public.messages (
  id            uuid primary key default gen_random_uuid(),
  sender_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  recipient_id  uuid references public.profiles (id) on delete cascade,
  body          text not null check (char_length(btrim(body)) between 1 and 1000),
  created_at    timestamptz not null default now(),
  check (recipient_id is null or recipient_id <> sender_id)
);
create index if not exists messages_created_idx on public.messages (created_at desc);
create index if not exists messages_recipient_idx on public.messages (recipient_id);
create index if not exists messages_sender_idx on public.messages (sender_id);

create table if not exists public.chat_reads (
  user_id       uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  thread        text not null check (char_length(thread) <= 64),
  last_read_at  timestamptz not null default now(),
  primary key (user_id, thread)
);

alter table public.messages   enable row level security;
alter table public.chat_reads enable row level security;

drop policy if exists "messages_select" on public.messages;
create policy "messages_select" on public.messages
  for select to authenticated
  using (recipient_id is null or sender_id = auth.uid() or recipient_id = auth.uid());
drop policy if exists "messages_insert" on public.messages;
create policy "messages_insert" on public.messages
  for insert to authenticated
  with check (sender_id = auth.uid() and (recipient_id is not null or public.is_coordinator()));
drop policy if exists "messages_delete" on public.messages;
create policy "messages_delete" on public.messages
  for delete to authenticated
  using (sender_id = auth.uid() or (recipient_id is null and public.is_coordinator()));

drop policy if exists "chat_reads_select" on public.chat_reads;
create policy "chat_reads_select" on public.chat_reads
  for select to authenticated using (user_id = auth.uid());
drop policy if exists "chat_reads_insert" on public.chat_reads;
create policy "chat_reads_insert" on public.chat_reads
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "chat_reads_update" on public.chat_reads;
create policy "chat_reads_update" on public.chat_reads
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

revoke all on public.messages, public.chat_reads from anon;
grant select, insert, delete on public.messages to authenticated;
grant select, insert, update on public.chat_reads to authenticated;

-- Nye meldinger vises med en gang (Supabase Realtime).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages') then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;
