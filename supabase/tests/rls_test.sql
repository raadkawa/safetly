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
