-- Safetly: vaktområde og sjekkpunkter som koordinatorer kan endre i appen.
-- Kjør denne i SQL Editor hvis du allerede har kjørt schema.sql og oppmotested.sql. Kan kjøres flere ganger.
-- Tom verdi betyr at appen bruker standardkartet i www/omrade.js.

alter table public.settings add column if not exists map jsonb;
alter table public.settings drop constraint if exists settings_map_size;
alter table public.settings add constraint settings_map_size
  check (map is null or (jsonb_typeof(map) = 'object' and pg_column_size(map) < 50000));
