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
    update profiles set role = 'forelder' where id = auth.uid();
    raise exception 'SKULLE FEILET: fjerne siste koordinator';
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
