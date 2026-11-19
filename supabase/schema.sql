-- Safetly – databaseskjema for Supabase
-- Kjør hele filen i Supabase: SQL Editor → New query → lim inn → Run.
-- Filen kan kjøres på nytt; den oppretter bare det som mangler og erstatter funksjoner og regler.
--
-- Tilgang (Row Level Security):
--   * Alle innloggede ser vakter, nyheter, rapporter, arrangementer og navn.
--   * Telefonnummer (private_contacts) ser bare eieren og koordinatorer.
--   * Koordinatorenes nummer er synlig for alle via funksjonen coordinator_contacts().
--   * Foreldre skriver bare sine egne bookinger, rapporter og påmeldinger.
--   * Bare koordinatorer legger ut nyheter, endrer roller og fjerner andre fra vakter.
--   * Første konto som opprettes blir koordinator.

-- ---------------------------------------------------------------- tabeller

create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null default '' check (char_length(full_name) <= 80),
  role        text not null default 'forelder' check (role in ('forelder', 'koordinator')),
  created_at  timestamptz not null default now()
);

create table if not exists public.private_contacts (
  user_id  uuid primary key references public.profiles (id) on delete cascade,
  phone    text not null default '' check (char_length(phone) <= 30)
);

-- slot 1 = 21:00–23:00, slot 2 = 23:00–01:00
create table if not exists public.bookings (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  shift_date  date not null,
  slot        smallint not null check (slot in (1, 2)),
  created_at  timestamptz not null default now(),
  unique (user_id, shift_date, slot)
);
create index if not exists bookings_date_idx on public.bookings (shift_date);

create table if not exists public.news (
  id          uuid primary key default gen_random_uuid(),
  author_id   uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 120),
  body        text not null check (char_length(body) between 1 and 2000),
  created_at  timestamptz not null default now()
);

create table if not exists public.reports (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  shift_date  date not null,
  slot        smallint not null check (slot in (1, 2)),
  mood        text not null check (mood in ('rolig', 'uro', 'hjelp')),
  note        text not null default '' check (char_length(note) <= 280),
  created_at  timestamptz not null default now(),
  unique (user_id, shift_date, slot)
);

create table if not exists public.events (
  id           uuid primary key default gen_random_uuid(),
  created_by   uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title        text not null check (char_length(title) between 1 and 120),
  event_date   date not null,
  event_time   time not null,
  place        text not null check (char_length(place) between 1 and 120),
  description  text not null default '' check (char_length(description) <= 1000),
  created_at   timestamptz not null default now()
);
create index if not exists events_date_idx on public.events (event_date);

create table if not exists public.event_attendees (
  event_id  uuid not null references public.events (id) on delete cascade,
  user_id   uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  primary key (event_id, user_id)
);

-- ---------------------------------------------------------------- hjelpefunksjoner

create or replace function public.is_coordinator()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'koordinator');
$$;

-- Ny bruker: lag profil og kontaktinfo. Første konto blir koordinator.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  is_first boolean;
begin
  perform pg_advisory_xact_lock(727274);
  select not exists (select 1 from public.profiles) into is_first;
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    left(coalesce(trim(new.raw_user_meta_data ->> 'full_name'), ''), 80),
    case when is_first then 'koordinator' else 'forelder' end
  );
  insert into public.private_contacts (user_id, phone)
  values (new.id, left(coalesce(trim(new.raw_user_meta_data ->> 'phone'), ''), 30));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Bare koordinatorer kan endre roller, og det må alltid finnes minst én koordinator.
-- Når auth.uid() er tom (SQL Editor, service role) tillates endringen.
create or replace function public.guard_profile_update()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if new.id <> old.id then
    raise exception 'Kan ikke endre id';
  end if;
  if new.role is distinct from old.role then
    if auth.uid() is not null and not public.is_coordinator() then
      raise exception 'Bare koordinatorer kan endre roller';
    end if;
    if old.role = 'koordinator'
       and (select count(*) from public.profiles where role = 'koordinator') <= 1 then
      raise exception 'Det må være minst én koordinator';
    end if;
  end if;
  if new.full_name is distinct from old.full_name
     and auth.uid() is not null and auth.uid() <> old.id then
    raise exception 'Du kan bare endre ditt eget navn';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard
  before update on public.profiles
  for each row execute function public.guard_profile_update();

-- Koordinatorenes navn og telefon, synlig for alle innloggede.
create or replace function public.coordinator_contacts()
returns table (full_name text, phone text)
language sql stable security definer
set search_path = public
as $$
  select p.full_name, coalesce(c.phone, '')
  from public.profiles p
  left join public.private_contacts c on c.user_id = p.id
  where p.role = 'koordinator' and auth.uid() is not null
  order by p.full_name;
$$;

revoke all on function public.coordinator_contacts() from public, anon;
grant execute on function public.coordinator_contacts() to authenticated;
revoke all on function public.is_coordinator() from public, anon;
grant execute on function public.is_coordinator() to authenticated;

-- ---------------------------------------------------------------- Row Level Security

alter table public.profiles         enable row level security;
alter table public.private_contacts enable row level security;
alter table public.bookings         enable row level security;
alter table public.news             enable row level security;
alter table public.reports          enable row level security;
alter table public.events           enable row level security;
alter table public.event_attendees  enable row level security;

-- profiles
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles
  for select to authenticated using (true);
drop policy if exists "profiles_update" on public.profiles;
create policy "profiles_update" on public.profiles
  for update to authenticated
  using (id = auth.uid() or public.is_coordinator())
  with check (id = auth.uid() or public.is_coordinator());

-- private_contacts (telefon)
drop policy if exists "contacts_select" on public.private_contacts;
create policy "contacts_select" on public.private_contacts
  for select to authenticated using (user_id = auth.uid() or public.is_coordinator());
drop policy if exists "contacts_insert" on public.private_contacts;
create policy "contacts_insert" on public.private_contacts
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "contacts_update" on public.private_contacts;
create policy "contacts_update" on public.private_contacts
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- bookings
drop policy if exists "bookings_select" on public.bookings;
create policy "bookings_select" on public.bookings
  for select to authenticated using (true);
drop policy if exists "bookings_insert" on public.bookings;
create policy "bookings_insert" on public.bookings
  for insert to authenticated
  with check (user_id = auth.uid() and shift_date >= current_date - 1);
drop policy if exists "bookings_delete" on public.bookings;
create policy "bookings_delete" on public.bookings
  for delete to authenticated using (user_id = auth.uid() or public.is_coordinator());

-- news
drop policy if exists "news_select" on public.news;
create policy "news_select" on public.news
  for select to authenticated using (true);
drop policy if exists "news_insert" on public.news;
create policy "news_insert" on public.news
  for insert to authenticated with check (author_id = auth.uid() and public.is_coordinator());
drop policy if exists "news_update" on public.news;
create policy "news_update" on public.news
  for update to authenticated using (public.is_coordinator()) with check (public.is_coordinator());
drop policy if exists "news_delete" on public.news;
create policy "news_delete" on public.news
  for delete to authenticated using (public.is_coordinator());

-- reports: bare for vakter du selv var booket på, og som har startet
drop policy if exists "reports_select" on public.reports;
create policy "reports_select" on public.reports
  for select to authenticated using (true);
drop policy if exists "reports_insert" on public.reports;
create policy "reports_insert" on public.reports
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and shift_date <= current_date
    and exists (
      select 1 from public.bookings b
      where b.user_id = auth.uid() and b.shift_date = reports.shift_date and b.slot = reports.slot
    )
  );
drop policy if exists "reports_delete" on public.reports;
create policy "reports_delete" on public.reports
  for delete to authenticated using (user_id = auth.uid() or public.is_coordinator());

-- events
drop policy if exists "events_select" on public.events;
create policy "events_select" on public.events
  for select to authenticated using (true);
drop policy if exists "events_insert" on public.events;
create policy "events_insert" on public.events
  for insert to authenticated with check (created_by = auth.uid());
drop policy if exists "events_update" on public.events;
create policy "events_update" on public.events
  for update to authenticated
  using (created_by = auth.uid() or public.is_coordinator())
  with check (created_by = auth.uid() or public.is_coordinator());
drop policy if exists "events_delete" on public.events;
create policy "events_delete" on public.events
  for delete to authenticated using (created_by = auth.uid() or public.is_coordinator());

-- event_attendees
drop policy if exists "attendees_select" on public.event_attendees;
create policy "attendees_select" on public.event_attendees
  for select to authenticated using (true);
drop policy if exists "attendees_insert" on public.event_attendees;
create policy "attendees_insert" on public.event_attendees
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "attendees_delete" on public.event_attendees;
create policy "attendees_delete" on public.event_attendees
  for delete to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------- innstillinger (oppmøtested)
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

-- ---------------------------------------------------------------- meldinger (chat)
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

-- Ingen tilgang for anonyme brukere.
revoke all on all tables in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
