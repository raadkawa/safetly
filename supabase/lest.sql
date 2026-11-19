-- Safetly: «Sendt / Sett» på meldinger. Kjør denne i SQL Editor etter chat.sql. Kan kjøres flere ganger.
--   * Du kan se når den du skriver med sist åpnet samtalen med deg (ikke noe annet).
--   * Koordinatorer ser hvor mange som har lest «Til alle» (bare antall, ikke hvem).

drop policy if exists "chat_reads_select" on public.chat_reads;
create policy "chat_reads_select" on public.chat_reads
  for select to authenticated using (user_id = auth.uid() or thread = auth.uid()::text);

-- Tidspunktet settes av databasen, så feil klokke på en telefon ikke gir feil «Sett».
create or replace function public.chat_reads_server_time()
returns trigger language plpgsql as $$
begin
  new.last_read_at := now();
  return new;
end;
$$;
drop trigger if exists chat_reads_time on public.chat_reads;
create trigger chat_reads_time
  before insert or update on public.chat_reads
  for each row execute function public.chat_reads_server_time();

create or replace function public.alle_read_times()
returns setof timestamptz
language sql stable security definer
set search_path = public
as $$
  select last_read_at from public.chat_reads
  where thread = 'alle' and user_id <> auth.uid() and public.is_coordinator();
$$;
revoke all on function public.alle_read_times() from public, anon;
grant execute on function public.alle_read_times() to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chat_reads') then
    alter publication supabase_realtime add table public.chat_reads;
  end if;
end $$;
