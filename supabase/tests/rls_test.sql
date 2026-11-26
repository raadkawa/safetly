-- Tester tilgangsreglene i schema.sql. Kjøres av scripts/test_db.sh.
\set ON_ERROR_STOP 1
insert into auth.users (id, email, raw_user_meta_data) values
 ('00000000-0000-0000-0000-00000000000a', 'kari@x.no', '{"full_name":"Kari Nilsen","phone":"41234567"}'),
 ('00000000-0000-0000-0000-00000000000b', 'ola@x.no',  '{"full_name":"Ola Hansen","phone":"98765432"}'),
 ('00000000-0000-0000-0000-00000000000c', 'per@x.no',  '{"full_name":"Per Berg","phone":"90000000"}');

do $$ begin
  assert (select role from profiles where full_name = 'Kari Nilsen') = 'koordinator', 'første konto skal være koordinator';
  assert (select role from profiles where full_name = 'Ola Hansen') = 'forelder', 'andre konto skal være forelder';
end $$;

-- Som forelder Ola
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false) \g /dev/null
do $$ begin
  assert (select count(*) from private_contacts) = 1, 'forelder skal bare se sitt eget nummer';
  assert (select count(*) from coordinator_contacts()) = 1, 'koordinatorkontakter skal være synlige';
end $$;
insert into bookings (user_id, shift_date, slot) values (auth.uid(), current_date, 1);
do $$ begin
  begin
    insert into bookings (user_id, shift_date, slot) values ('00000000-0000-0000-0000-00000000000c', current_date, 1);
    raise exception 'SKULLE FEILET: booke for andre';
  exception when insufficient_privilege then null; end;
  begin
    insert into news (title, body) values ('x', 'y');
    raise exception 'SKULLE FEILET: forelder legger ut nyhet';
  exception when insufficient_privilege then null; end;
  begin
    update profiles set role = 'koordinator' where id = auth.uid();
    raise exception 'SKULLE FEILET: forelder endrer egen rolle';
  exception when raise_exception then
    if sqlerrm like 'SKULLE%' then raise; end if;
  end;
  begin
    insert into reports (shift_date, slot, mood) values (current_date, 2, 'rolig');
    raise exception 'SKULLE FEILET: rapport uten booking';
  exception when insufficient_privilege then null; end;
end $$;
insert into reports (shift_date, slot, mood, note) values (current_date, 1, 'rolig', 'Stille kveld');
insert into events (title, event_date, event_time, place) values ('Refleksvandring', current_date + 2, '17:00', 'Torget');
insert into event_attendees (event_id) select id from events limit 1;
update profiles set full_name = 'Ola H.' where id = auth.uid();
update private_contacts set phone = '11111111' where user_id = auth.uid();

do $$ begin
  update settings set meeting_name = 'hacket' where id = 1;
  assert (select meeting_name from settings where id = 1) = '', 'forelder skal ikke endre oppmøtested';
end $$;

-- Som forelder Per
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false) \g /dev/null
delete from bookings where user_id = '00000000-0000-0000-0000-00000000000b';
do $$ begin assert (select count(*) from bookings) = 1, 'Per skal ikke kunne slette Olas booking'; end $$;
update profiles set full_name = 'hacket' where id = '00000000-0000-0000-0000-00000000000b';
delete from event_attendees;
do $$ begin
  assert (select count(*) from event_attendees) = 1, 'Per skal ikke kunne melde av Ola';
  assert (select count(*) from private_contacts) = 1, 'Per ser bare sitt eget nummer';
end $$;

-- Som koordinator Kari
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false) \g /dev/null
do $$ begin
  assert (select full_name from profiles where id = '00000000-0000-0000-0000-00000000000b') = 'Ola H.', 'Per skal ikke endre andres navn';
  assert (select count(*) from private_contacts) = 3, 'koordinator ser alle numre';
end $$;
insert into news (title, body) values ('Ukas nytt', 'Vi trenger flere fredag');
update settings set meeting_name = 'Torget' where id = 1;
do $$ begin assert (select meeting_name from settings where id = 1) = 'Torget', 'koordinator kan endre oppmøtested'; end $$;
update profiles set role = 'koordinator' where full_name = 'Per Berg';
do $$ begin assert (select role from profiles where full_name = 'Per Berg') = 'koordinator', 'koordinator kan endre rolle'; end $$;
delete from bookings where user_id = '00000000-0000-0000-0000-00000000000b';
do $$ begin assert (select count(*) from bookings) = 0, 'koordinator kan fjerne forelder fra vakt'; end $$;
update profiles set role = 'forelder' where full_name = 'Per Berg';
do $$ begin
  begin
    update profiles set is_admin = false where id = auth.uid();
    raise exception 'SKULLE FEILET: fjerne siste administrator';
  exception when raise_exception then
    if sqlerrm like 'SKULLE%' then raise; end if;
  end;
end $$;

-- Meldinger
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false) \g /dev/null
set role authenticated;
insert into messages (recipient_id, body) values ('00000000-0000-0000-0000-00000000000c', 'Hei Per, går du fredag?');
do $$ begin
  begin
    insert into messages (recipient_id, body) values (null, 'til alle fra forelder');
    raise exception 'SKULLE FEILET: forelder skriver til alle';
  exception when insufficient_privilege then null; end;
  begin
    insert into messages (sender_id, recipient_id, body) values ('00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000b', 'falsk avsender');
    raise exception 'SKULLE FEILET: falsk avsender';
  exception when insufficient_privilege then null; end;
end $$;
insert into chat_reads (thread) values ('alle');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false) \g /dev/null
insert into messages (recipient_id, body) values (null, 'Hei alle! Husk refleks.');
do $$ begin
  assert (select count(*) from messages) = 1, 'koordinator skal ikke se andres direktemeldinger';
  assert (select count(*) from chat_reads) = 0, 'skal ikke se andres lesestatus';
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false) \g /dev/null
do $$ begin assert (select count(*) from messages) = 2, 'Per ser meldingen til seg og beskjeden til alle'; end $$;
delete from messages where recipient_id is null;
do $$ begin assert (select count(*) from messages) = 2, 'Per skal ikke kunne slette beskjeden til alle'; end $$;
reset role;

-- Lest / sett
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false) \g /dev/null
insert into chat_reads (thread, last_read_at) values ('00000000-0000-0000-0000-00000000000b', '2000-01-01');
insert into chat_reads (thread) values ('alle');
do $$ begin
  assert (select last_read_at from chat_reads where thread = '00000000-0000-0000-0000-00000000000b') > '2020-01-01', 'databasen skal sette tidspunktet';
  assert (select count(*) from alle_read_times()) = 0, 'forelder skal ikke se lesetall';
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false) \g /dev/null
do $$ begin
  assert (select count(*) from chat_reads where user_id = '00000000-0000-0000-0000-00000000000c') = 1, 'Ola ser at Per har lest samtalen med Ola';
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false) \g /dev/null
do $$ begin
  assert (select count(*) from chat_reads where user_id = '00000000-0000-0000-0000-00000000000c') = 0, 'Kari ser ikke Pers lesestatus med andre';
  assert (select count(*) from alle_read_times()) = 2, 'koordinator ser antall som har lest «Til alle»';
end $$;
reset role;

-- Kart
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false) \g /dev/null
update settings set map = '{"area": [[1,1],[1,2],[2,2]]}' where id = 1;
do $$ begin assert (select map from settings where id = 1) is null, 'forelder skal ikke endre kartet'; end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false) \g /dev/null
update settings set map = '{"name": "Test", "area": [[63.39,10.35],[63.40,10.36],[63.39,10.37]], "checkpoints": []}' where id = 1;
do $$ begin assert (select map->>'name' from settings where id = 1) = 'Test', 'koordinator kan endre kartet'; end $$;
reset role;

-- Vakttider
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false) \g /dev/null
update settings set shifts = '{"slots": [], "min": 1, "days": [4]}' where id = 1;
do $$ begin assert (select shifts from settings where id = 1) is null, 'forelder skal ikke endre vakttider'; end $$;
insert into bookings (user_id, shift_date, slot) values (auth.uid(), current_date + 1, 3);
do $$ begin
  begin
    insert into bookings (user_id, shift_date, slot) values (auth.uid(), current_date + 1, 5);
    raise exception 'SKULLE FEILET: vakt 5';
  exception when check_violation then null; end;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false) \g /dev/null
update settings set shifts = '{"slots": [{"name": "Kveld", "start": "20:00", "end": "22:00"}], "min": 3, "days": [4, 5]}' where id = 1;
do $$ begin assert (select shifts->>'min' from settings where id = 1) = '3', 'koordinator kan endre vakttider'; end $$;
reset role;

-- Push-varsler
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false) \g /dev/null
select save_push_subscription('https://push.example/abc', 'p256', 'auth1') \g /dev/null
update profiles set notify = '{"meldinger": false}' where id = auth.uid();
do $$ begin
  assert (select count(*) from push_subscriptions) = 1, 'Ola ser sin egen telefon';
  assert (select notify->>'meldinger' from profiles where id = auth.uid()) = 'false', 'Ola kan endre egne varsler';
  begin perform count(*) from push_config; raise exception 'SKULLE FEILET: push_config';
  exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false) \g /dev/null
do $$ begin assert (select count(*) from push_subscriptions) = 0, 'Per ser ikke Olas telefon'; end $$;
delete from push_subscriptions;
select save_push_subscription('https://push.example/abc', 'p256', 'auth2') \g /dev/null
do $$ begin assert (select count(*) from push_subscriptions) = 1, 'telefonen flyttes til Per når han logger inn'; end $$;
reset role;
do $$ begin assert (select user_id from push_subscriptions) = '00000000-0000-0000-0000-00000000000c', 'telefonen tilhører nå Per'; end $$;

-- Lag
reset role;
insert into teams (id, name) values ('00000000-0000-0000-0000-0000000000f2', 'Ugla – Dalgård');
do $$ begin
  assert (select count(*) from teams) = 2, 'to lag';
  assert (select count(*) from profiles where team_id is null) = 0, 'alle havnet i første lag';
  assert (select is_admin from profiles where full_name = 'Kari Nilsen'), 'første koordinator er administrator';
  assert (select count(*) from bookings where team_id is null) = 0, 'vakter har lag';
end $$;
set role authenticated;
-- Forelder Ola bytter lag og booker der
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false) \g /dev/null
update profiles set team_id = '00000000-0000-0000-0000-0000000000f2' where id = auth.uid();
insert into bookings (user_id, shift_date, slot) values (auth.uid(), current_date + 3, 1);
do $$ begin
  assert (select team_id from bookings where user_id = auth.uid() and shift_date = current_date + 3) = '00000000-0000-0000-0000-0000000000f2', 'booking får lag automatisk';
  begin update profiles set is_admin = true where id = auth.uid(); raise exception 'SKULLE FEILET: gjøre seg selv til admin';
  exception when raise_exception then if sqlerrm like 'SKULLE%' then raise; end if; end;
  begin insert into teams (name) values ('Mitt lag'); raise exception 'SKULLE FEILET: forelder lager lag';
  exception when insufficient_privilege then null; end;
end $$;
update teams set meeting_name = 'hacket' where true;
do $$ begin assert (select count(*) from teams where meeting_name = 'hacket') = 0, 'forelder kan ikke endre lag'; end $$;
-- Admin Kari gjør Per til koordinator i Ugla – Dalgård
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false) \g /dev/null
update profiles set team_id = '00000000-0000-0000-0000-0000000000f2', role = 'koordinator' where full_name = 'Per Berg';
do $$ begin assert (select role from profiles where full_name = 'Per Berg') = 'koordinator', 'admin flytter og forfremmer'; end $$;
-- Per (koordinator i Ugla – Dalgård) styrer sitt lag, men ikke det første laget
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false) \g /dev/null
update teams set meeting_name = 'Ugla skole' where id = '00000000-0000-0000-0000-0000000000f2';
update teams set meeting_name = 'hacket' where id <> '00000000-0000-0000-0000-0000000000f2';
do $$ begin
  assert (select meeting_name from teams where id = '00000000-0000-0000-0000-0000000000f2') = 'Ugla skole', 'koordinator endrer eget lag';
  assert (select count(*) from teams where meeting_name = 'hacket') = 0, 'koordinator endrer ikke andres lag';
  assert (select count(*) from private_contacts where user_id = '00000000-0000-0000-0000-00000000000b') = 1, 'Per ser telefonen til Ola i sitt lag';
  assert (select count(*) from private_contacts where user_id = '00000000-0000-0000-0000-00000000000a') = 0, 'Per ser ikke Karis telefon';
end $$;
insert into news (title, body) values ('Ugla-nytt', 'Vakt fredag');
do $$ begin
  assert (select team_id from news where title = 'Ugla-nytt') = '00000000-0000-0000-0000-0000000000f2', 'nyhet går til eget lag';
  begin insert into news (title, body, team_id) values ('x', 'y', (select id from teams where name = 'Byåsen – Hallset')); raise exception 'SKULLE FEILET: nyhet til annet lag';
  exception when insufficient_privilege then null; end;
end $$;
delete from bookings where user_id = '00000000-0000-0000-0000-00000000000b' and shift_date = current_date + 3;
do $$ begin assert (select count(*) from bookings where user_id = '00000000-0000-0000-0000-00000000000b' and shift_date = current_date + 3) = 0, 'koordinator fjerner fra vakt i eget lag'; end $$;
-- Per bytter selv lag: mister koordinatorrollen
update profiles set team_id = (select id from teams where name = 'Byåsen – Hallset') where id = auth.uid();
do $$ begin assert (select role from profiles where id = auth.uid()) = 'forelder', 'koordinatorrollen følger ikke med til nytt lag'; end $$;
reset role;

-- Blokkere og rapportere
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false) \g /dev/null
insert into blocks (blocked_id) values ('00000000-0000-0000-0000-00000000000b');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false) \g /dev/null
do $$ begin
  assert (select count(*) from blocks) = 0, 'Ola ser ikke at Per har blokkert ham';
  begin insert into messages (recipient_id, body) values ('00000000-0000-0000-0000-00000000000c', 'hei igjen'); raise exception 'SKULLE FEILET: blokkert sender';
  exception when insufficient_privilege then null; end;
end $$;
insert into messages (recipient_id, body) values ('00000000-0000-0000-0000-00000000000a', 'Stygg melding');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false) \g /dev/null
insert into content_reports (message_id, reported_user, message_text, reason)
  select id, sender_id, body, 'Ufin' from messages where body = 'Stygg melding';
do $$ begin assert (select count(*) from content_reports) = 1, 'admin ser rapporten'; end $$;
delete from messages where body = 'Stygg melding';
do $$ begin
  assert (select count(*) from messages where body = 'Stygg melding') = 0, 'admin sletter rapportert melding';
  assert (select message_text from content_reports limit 1) = 'Stygg melding', 'rapporten beholder teksten';
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false) \g /dev/null
do $$ begin assert (select count(*) from content_reports) = 0, 'forelder ser ikke andres rapporter'; end $$;
reset role;

-- Anonym: ingen tilgang
reset role;
set role anon;
do $$ begin
  begin
    perform count(*) from bookings;
    raise exception 'SKULLE FEILET: anonym tilgang';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select 'ALLE RLS-TESTER OK' as resultat;
