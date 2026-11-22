-- Safetly: lag (flere nabolag i samme app).
-- Kjør denne i SQL Editor etter de andre filene. Kan kjøres flere ganger.
--
--   * Hvert lag har egen vaktliste, vakttider, kart og oppmøtested, og egne koordinatorer.
--   * Hver forelder hører til ett lag (profiles.team_id) og velger det i appen.
--   * Meldinger, «Til alle» og arrangementer er felles for alle lag.
--   * Ukas nyheter kan gå til ett lag eller til alle lag.
--   * Administrator (profiles.is_admin) kan lage lag og hjelpe alle lag. Koordinator styrer sitt eget lag.
--   * Det som finnes fra før (vakter, kart, vakttider, oppmøtested) blir laget «Byåsen – Hallset».

create table if not exists public.teams (
  id               uuid primary key default gen_random_uuid(),
  name             text not null check (char_length(btrim(name)) between 1 and 60),
  meeting_name     text not null default '' check (char_length(meeting_name) <= 120),
  meeting_address  text not null default '' check (char_length(meeting_address) <= 200),
  meeting_note     text not null default '' check (char_length(meeting_note) <= 500),
  map              jsonb check (map is null or (jsonb_typeof(map) = 'object' and pg_column_size(map) < 50000)),
  shifts           jsonb check (shifts is null or (jsonb_typeof(shifts) = 'object' and pg_column_size(shifts) < 5000)),
  created_at       timestamptz not null default now()
);

alter table public.profiles add column if not exists team_id uuid references public.teams (id) on delete set null;
alter table public.profiles add column if not exists is_admin boolean not null default false;
alter table public.bookings add column if not exists team_id uuid references public.teams (id) on delete cascade;
alter table public.reports  add column if not exists team_id uuid references public.teams (id) on delete cascade;
alter table public.news     add column if not exists team_id uuid references public.teams (id) on delete cascade;
create index if not exists profiles_team_idx on public.profiles (team_id);
create index if not exists bookings_team_idx on public.bookings (team_id, shift_date);

-- Flytt det som finnes til et første lag.
do $$
declare
  t uuid;
  s record;
begin
  if not exists (select 1 from public.teams) then
    select * into s from public.settings where id = 1;
    insert into public.teams (name, meeting_name, meeting_address, meeting_note, map, shifts)
    values (
      'Byåsen – Hallset',
      coalesce(s.meeting_name, ''), coalesce(s.meeting_address, ''), coalesce(s.meeting_note, ''),
      case when s is null then null else nullif(to_jsonb(s) -> 'map', 'null'::jsonb) end,
      case when s is null then null else nullif(to_jsonb(s) -> 'shifts', 'null'::jsonb) end
    )
    returning id into t;
    update public.profiles set team_id = t where team_id is null;
    update public.bookings set team_id = t where team_id is null;
    update public.reports  set team_id = t where team_id is null;
    update public.profiles set is_admin = true where role = 'koordinator';
  end if;
end $$;

-- ---------------------------------------------------------------- hjelpefunksjoner
create or replace function public.my_team()
returns uuid language sql stable security definer set search_path = public as $$
  select team_id from public.profiles where id = auth.uid();
$$;
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;
-- Koordinator for et bestemt lag (eller administrator).
create or replace function public.is_team_coordinator(t uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and (is_admin or (role = 'koordinator' and team_id is not distinct from t))
  );
$$;
revoke all on function public.my_team(), public.is_admin(), public.is_team_coordinator(uuid) from public, anon;
grant execute on function public.my_team(), public.is_admin(), public.is_team_coordinator(uuid) to authenticated;

-- Nye brukere: første konto blir administrator og koordinator. Finnes det bare ett lag, havner man der.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  is_first boolean;
  only_team uuid;
begin
  perform pg_advisory_xact_lock(727274);
  select not exists (select 1 from public.profiles) into is_first;
  if (select count(*) from public.teams) = 1 then select id into only_team from public.teams; end if;
  insert into public.profiles (id, full_name, role, is_admin, team_id)
  values (
    new.id,
    left(coalesce(trim(new.raw_user_meta_data ->> 'full_name'), ''), 80),
    case when is_first then 'koordinator' else 'forelder' end,
    is_first,
    only_team
  );
  insert into public.private_contacts (user_id, phone)
  values (new.id, left(coalesce(trim(new.raw_user_meta_data ->> 'phone'), ''), 30));
  return new;
end;
$$;

-- Regler for endring av profiler.
create or replace function public.guard_profile_update()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  admin boolean := public.is_admin();
begin
  if new.id <> old.id then raise exception 'Kan ikke endre id'; end if;
  if uid is null then return new; end if; -- SQL Editor / service role

  if new.full_name is distinct from old.full_name and uid <> old.id then
    raise exception 'Du kan bare endre ditt eget navn';
  end if;
  if new.is_admin is distinct from old.is_admin then
    if not admin then raise exception 'Bare administrator kan gjøre andre til administrator'; end if;
    if old.is_admin and (select count(*) from public.profiles where is_admin) <= 1 then
      raise exception 'Det må være minst én administrator';
    end if;
  end if;
  if new.team_id is distinct from old.team_id then
    if uid <> old.id and not admin and not public.is_team_coordinator(old.team_id) then
      raise exception 'Du kan bare bytte ditt eget lag';
    end if;
    -- Bytter man lag, følger ikke koordinatorrollen med (unntatt for administrator).
    if new.role = 'koordinator' and not new.is_admin and not (admin and uid <> old.id) then
      new.role := 'forelder';
    end if;
  end if;
  if new.role is distinct from old.role and not (new.team_id is distinct from old.team_id and new.role = 'forelder') then
    if not admin and not (public.is_team_coordinator(old.team_id) and new.team_id is not distinct from old.team_id) then
      raise exception 'Bare koordinator i laget kan endre roller';
    end if;
  end if;
  return new;
end;
$$;

-- Lag og vakter får riktig lag automatisk (også fra eldre versjoner av appen).
create or replace function public.set_team_from_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if new.team_id is null then
    if tg_table_name = 'reports' then
      select b.team_id into new.team_id from public.bookings b
      where b.user_id = new.user_id and b.shift_date = new.shift_date and b.slot = new.slot;
    elsif tg_table_name = 'news' then
      if not public.is_admin() then select team_id into new.team_id from public.profiles where id = new.author_id; end if;
    else
      select team_id into new.team_id from public.profiles where id = new.user_id;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists bookings_team on public.bookings;
create trigger bookings_team before insert on public.bookings for each row execute function public.set_team_from_user();
drop trigger if exists reports_team on public.reports;
create trigger reports_team before insert on public.reports for each row execute function public.set_team_from_user();
drop trigger if exists news_team on public.news;
create trigger news_team before insert on public.news for each row execute function public.set_team_from_user();

-- Koordinatorene for mitt lag (og administratorer), med telefon.
create or replace function public.coordinator_contacts()
returns table (full_name text, phone text)
language sql stable security definer
set search_path = public
as $$
  select p.full_name, coalesce(c.phone, '')
  from public.profiles p
  left join public.private_contacts c on c.user_id = p.id
  where auth.uid() is not null
    and ((p.role = 'koordinator' and p.team_id is not distinct from public.my_team()) or p.is_admin)
  order by p.is_admin, p.full_name;
$$;

-- ---------------------------------------------------------------- Row Level Security
alter table public.teams enable row level security;
drop policy if exists "teams_select" on public.teams;
create policy "teams_select" on public.teams for select to authenticated using (true);
drop policy if exists "teams_insert" on public.teams;
create policy "teams_insert" on public.teams for insert to authenticated with check (public.is_admin());
drop policy if exists "teams_update" on public.teams;
create policy "teams_update" on public.teams for update to authenticated
  using (public.is_team_coordinator(id)) with check (public.is_team_coordinator(id));
drop policy if exists "teams_delete" on public.teams;
create policy "teams_delete" on public.teams for delete to authenticated using (public.is_admin());

-- Profiler: egen, koordinator i laget eller administrator.
drop policy if exists "profiles_update" on public.profiles;
create policy "profiles_update" on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_admin() or public.is_team_coordinator(team_id))
  with check (id = auth.uid() or public.is_admin() or public.is_team_coordinator(team_id) or public.is_team_coordinator(public.my_team()));

-- Telefon: egen, koordinator i personens lag, eller administrator.
drop policy if exists "contacts_select" on public.private_contacts;
create policy "contacts_select" on public.private_contacts for select to authenticated
  using (user_id = auth.uid() or public.is_admin()
         or exists (select 1 from public.profiles p where p.id = private_contacts.user_id and public.is_team_coordinator(p.team_id)));

-- Vakter: koordinator i laget kan fjerne folk fra vakter i sitt lag.
drop policy if exists "bookings_delete" on public.bookings;
create policy "bookings_delete" on public.bookings for delete to authenticated
  using (user_id = auth.uid() or public.is_team_coordinator(team_id));

-- Nyheter: koordinator skriver til sitt lag; administrator kan også skrive til alle lag (team_id tom).
drop policy if exists "news_insert" on public.news;
create policy "news_insert" on public.news for insert to authenticated
  with check (author_id = auth.uid() and (case when team_id is null then public.is_admin() else public.is_team_coordinator(team_id) end));
drop policy if exists "news_update" on public.news;
create policy "news_update" on public.news for update to authenticated
  using (case when team_id is null then public.is_admin() else public.is_team_coordinator(team_id) end)
  with check (case when team_id is null then public.is_admin() else public.is_team_coordinator(team_id) end);
drop policy if exists "news_delete" on public.news;
create policy "news_delete" on public.news for delete to authenticated
  using (case when team_id is null then public.is_admin() else public.is_team_coordinator(team_id) end);

-- Rapporter: koordinator i laget kan slette.
drop policy if exists "reports_delete" on public.reports;
create policy "reports_delete" on public.reports for delete to authenticated
  using (user_id = auth.uid() or public.is_team_coordinator(team_id));

revoke all on public.teams from anon;
grant select, insert, update, delete on public.teams to authenticated;
grant select on public.teams to service_role;
