-- Safetly: vakttider som koordinatorer kan endre i appen (klokkeslett, antall vakter, minst antall voksne, dager).
-- Kjør denne i SQL Editor hvis du allerede har kjørt schema.sql og oppmotested.sql. Kan kjøres flere ganger.
-- Tom verdi betyr standard: 21:00–23:00 og 23:00–01:00 alle dager, minst 2 voksne.

alter table public.settings add column if not exists shifts jsonb;
alter table public.settings drop constraint if exists settings_shifts_size;
alter table public.settings add constraint settings_shifts_size
  check (shifts is null or (jsonb_typeof(shifts) = 'object' and pg_column_size(shifts) < 5000));

-- Inntil fire vakter per kveld.
alter table public.bookings drop constraint if exists bookings_slot_check;
alter table public.bookings add constraint bookings_slot_check check (slot between 1 and 4);
alter table public.reports drop constraint if exists reports_slot_check;
alter table public.reports add constraint reports_slot_check check (slot between 1 and 4);
