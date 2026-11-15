-- Row-level security and trigger checks for 001_reviews.sql.
-- Runs in pglite from tests/reviewsDb.test.ts (after auth_stub.sql, the migration and the seeds).
-- Any failed check raises "FAIL: ..." (SQLSTATE TF001) and stops the script.

create schema if not exists t;
grant usage on schema t to anon, authenticated;
create or replace function t.ok(cond boolean, what text) returns void language plpgsql as $$
begin
  if cond is not true then
    raise exception 'FAIL: %', what using errcode = 'TF001';
  end if;
end;
$$;
create or replace function t.fails(q text, what text) returns void language plpgsql as $$
begin
  begin
    execute q;
  exception when others then
    return;
  end;
  raise exception 'FAIL: % (should have been refused)', what using errcode = 'TF001';
end;
$$;
-- run q and return its error message ('' if it worked), to check *why* something was refused
create or replace function t.err(q text) returns text language plpgsql as $$
begin
  execute q;
  return '';
exception when others then
  return sqlstate || ' ' || sqlerrm;
end;
$$;
create or replace function t.as_user(uid text, email text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'email', email, 'role', 'authenticated')::text, false);
$$;
create or replace function t.as_anon() returns void language sql as $$
  select set_config('request.jwt.claims', '{"role":"anon"}', false);
$$;
grant execute on all functions in schema t to anon, authenticated;

insert into public.allowed_domains (domain) values ('seecs.edu.pk'), ('nust.edu.pk');
insert into public.excluded_places (place_id) values ('central-mosque');

-- A, B, C, D are students; X has a gmail address.
-- a: 00000000-0000-0000-0000-00000000000a   b: ...0b   c: ...0c   d: ...0d   x: ...0e

-- ---------------------------------------------------------------- anon
select t.as_anon();
set role anon;
select t.fails($$select * from public.reviews$$, 'anon reads the reviews table');
select t.fails($$select * from public.food_ratings$$, 'anon reads the food_ratings table');
select t.fails($$select * from public.allowed_domains$$, 'anon reads allowed_domains');
select t.fails($$select * from public.blocked_terms$$, 'anon reads blocked_terms');
select t.fails($$select * from public.write_log$$, 'anon reads write_log');
select t.fails($$insert into public.reviews (place_id, display_name, rating) values ('concordia-1-6900', 'Anon', 5)$$, 'anon writes a review');
select t.fails($$select public.delete_my_data()$$, 'anon calls delete_my_data');
select t.ok((select count(*) from public.public_reviews) = 0, 'anon can read public_reviews (empty)');
select t.ok((select count(*) from public.place_rating_summary) = 0, 'anon can read place_rating_summary');
select t.ok((select count(*) from public.food_rating_summary) = 0, 'anon can read food_rating_summary');
-- 004 gives anon USAGE on `private` for private.author_kind() (used by the views); nothing else there opens up
select t.fails($$select private.is_guest()$$, 'anon calls private.is_guest');
select t.fails($$select private.can_write()$$, 'anon calls private.can_write');
select t.fails($$select private.email_allowed()$$, 'anon calls private.email_allowed');
select t.fails($$select private.name_violation('x')$$, 'anon calls private.name_violation');
reset role;

-- ---------------------------------------------------------------- X: signed in, wrong domain
select t.as_user('00000000-0000-0000-0000-00000000000e', 'x@gmail.com');
set role authenticated;
select t.fails($$insert into public.reviews (place_id, display_name, rating) values ('concordia-1-6900', 'Outsider', 5)$$, 'non-university email posts');
select t.fails($$insert into public.food_ratings (item_key, cafe_id, rating) values ('c1/chai', 'c1', 5)$$, 'non-university email rates');
reset role;

-- ---------------------------------------------------------------- A writes
select t.as_user('00000000-0000-0000-0000-00000000000a', 'a@SEECS.edu.pk');
set role authenticated;
-- user_id from the client is ignored: the trigger sets it from the token
insert into public.reviews (place_id, user_id, display_name, rating, body, hidden, report_count)
  values ('concordia-1-6900', '00000000-0000-0000-0000-00000000000b', '  Student A ', 4, ' Good chai ', true, 99);
select t.ok((select user_id from public.reviews where place_id = 'concordia-1-6900')
  = '00000000-0000-0000-0000-00000000000a', 'user_id forced to the caller');
select t.ok((select display_name || '|' || body from public.reviews) = 'Student A|Good chai', 'text trimmed');
select t.ok((select not hidden and report_count = 0 from public.reviews), 'client cannot pre-set hidden / report_count');
select t.fails($$insert into public.reviews (place_id, display_name, rating) values ('concordia-1-6900', 'Student A', 5)$$, 'second review of the same place');
select t.ok(t.err($$insert into public.reviews (place_id, display_name, rating, body) values ('seecs-ug-block-0148', 'Student A', 3, 'see www.example.com')$$) like '%text not allowed: link%', 'link refused');
select t.ok(t.err($$insert into public.reviews (place_id, display_name, rating, body) values ('seecs-ug-block-0148', 'Student A', 3, 'call 0300 1234567')$$) like '%text not allowed: phone%', 'phone refused');
select t.ok(t.err($$insert into public.reviews (place_id, display_name, rating, body) values ('seecs-ug-block-0148', 'Sh1t head', 3, '')$$) like '%text not allowed: blocked%', 'blocked display name refused');
select t.ok(t.err($$insert into public.reviews (place_id, display_name, rating) values ('central-mosque', 'Student A', 5)$$) like '%does not take reviews%', 'excluded place refused');
select t.fails($$insert into public.reviews (place_id, display_name, rating) values ('concordia-1-6900x', 'Student A', 6)$$, 'rating 6');
select t.fails($$insert into public.reviews (place_id, display_name, rating) values ('Bad Id!', 'Student A', 5)$$, 'malformed place id');
select t.fails($$insert into public.reviews (place_id, display_name, rating, body) values ('seecs-ug-block-0148', 'Student A', 5, repeat('a', 501))$$, 'body over 500 chars');
-- own update works, but cannot unhide / move the review
update public.reviews set rating = 5, hidden = true, place_id = 'other-place' where place_id = 'concordia-1-6900';
select t.ok((select rating = 5 and not hidden and place_id = 'concordia-1-6900' from public.reviews), 'update keeps protected columns');
insert into public.food_ratings (item_key, cafe_id, rating) values ('c1/chicken-tikka-piece', 'c1', 5);
select t.fails($$insert into public.food_ratings (item_key, cafe_id, rating) values ('c2/chai', 'c1', 5)$$, 'item key of another cafe');
select t.fails($$insert into public.food_ratings (item_key, cafe_id, rating) values ('c1/chicken-tikka-piece', 'c1', 4)$$, 'second rating of the same item');
reset role;

-- ---------------------------------------------------------------- B cannot touch A's rows
select t.as_user('00000000-0000-0000-0000-00000000000b', 'b@nust.edu.pk');
set role authenticated;
select t.ok((select count(*) from public.reviews) = 0, 'B cannot see A''s raw review row');
select t.ok((select count(*) from public.food_ratings) = 0, 'B cannot see A''s raw food rating');
with u as (update public.reviews set body = 'hacked' returning 1) select t.ok((select count(*) from u) = 0, 'B cannot update A''s review');
with d as (delete from public.reviews returning 1) select t.ok((select count(*) from d) = 0, 'B cannot delete A''s review');
select t.ok((select count(*) from public.public_reviews where not mine) = 1, 'B sees A''s review through the view, not as mine');
select t.ok(not exists (select 1 from information_schema.columns where table_name = 'public_reviews' and column_name = 'user_id'), 'the public view has no user_id');
select t.ok((select count = 1 and avg = 5 from public.place_rating_summary where place_id = 'concordia-1-6900'), 'summary counts A''s review');
select t.ok((select count = 1 from public.food_rating_summary where item_key = 'c1/chicken-tikka-piece'), 'food summary counts A''s rating');
insert into public.review_reports (review_id, reason) select id, 'not about the place' from public.public_reviews;
insert into public.reviews (place_id, display_name, rating) values ('seecs-ug-block-0148', 'Student B', 2);
select t.ok(t.err($$insert into public.review_reports (review_id) select id from public.public_reviews where mine$$) like '%own review%', 'B cannot report own review');
reset role;

-- ---------------------------------------------------------------- C and D report A: hidden at 3
select t.as_user('00000000-0000-0000-0000-00000000000c', 'c@seecs.edu.pk');
set role authenticated;
insert into public.review_reports (review_id) select id from public.public_reviews where place_id = 'concordia-1-6900';
select t.fails($$insert into public.review_reports (review_id) select id from public.public_reviews where place_id = 'concordia-1-6900'$$, 'reporting twice');
reset role;
select t.ok((select report_count = 2 and not hidden from public.reviews where place_id = 'concordia-1-6900'), 'two reports: still visible');
select t.as_user('00000000-0000-0000-0000-00000000000d', 'd@seecs.edu.pk');
set role authenticated;
insert into public.review_reports (review_id) select id from public.public_reviews where place_id = 'concordia-1-6900';
select t.ok((select count(*) from public.public_reviews where place_id = 'concordia-1-6900') = 0, 'hidden after 3 reports');
select t.ok(not exists (select 1 from public.place_rating_summary where place_id = 'concordia-1-6900'), 'hidden review leaves the summary');
insert into public.reviews (place_id, display_name, rating) values ('retro-8873', 'Student D', 4);
reset role;
select t.as_user('00000000-0000-0000-0000-00000000000a', 'a@seecs.edu.pk');
set role authenticated;
select t.ok((select hidden from public.reviews where place_id = 'concordia-1-6900'), 'author still sees own hidden review');
reset role;

-- ---------------------------------------------------------------- rate limits
select t.as_user('00000000-0000-0000-0000-00000000000c', 'c@seecs.edu.pk');
set role authenticated;
insert into public.food_ratings (item_key, cafe_id, rating)
  select 'c1/item-' || g, 'c1', 3 from generate_series(1, 10) g;
select t.ok(t.err($$insert into public.food_ratings (item_key, cafe_id, rating) values ('c1/item-11', 'c1', 3)$$) like 'P0429%', '11th write in an hour refused');
reset role;
update public.review_limits set reports_per_day = 2;
select t.as_user('00000000-0000-0000-0000-00000000000b', 'b@nust.edu.pk');
set role authenticated;
insert into public.review_reports (review_id) select id from public.public_reviews where place_id = 'retro-8873';
-- the limit is checked before the review id is, so a made-up id still shows the limit
select t.ok(t.err($$insert into public.review_reports (review_id) values (gen_random_uuid())$$) like 'P0429%', '3rd report in a day refused');
reset role;
update public.review_limits set reports_per_day = 20;

-- ---------------------------------------------------------------- delete my data
select t.as_user('00000000-0000-0000-0000-00000000000a', 'a@seecs.edu.pk');
set role authenticated;
select public.delete_my_data();
select t.ok((select count(*) from public.reviews) = 0 and (select count(*) from public.food_ratings) = 0, 'A''s rows deleted');
reset role;
select t.ok(not exists (select 1 from public.reviews where user_id = '00000000-0000-0000-0000-00000000000a'), 'nothing of A left');
select t.ok(not exists (select 1 from public.write_log where user_id = '00000000-0000-0000-0000-00000000000a'), 'A''s rate-limit log deleted');
select t.ok(exists (select 1 from public.reviews where user_id = '00000000-0000-0000-0000-00000000000b'), 'B''s review untouched');

-- ---------------------------------------------------------------- guests (003_guest_reviews.sql)
-- Guests are Supabase anonymous users: same `authenticated` role, token claim is_anonymous = true.
create or replace function t.as_guest(uid text, email text default '') returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', uid, 'email', email, 'role', 'authenticated', 'is_anonymous', true)::text, false);
$$;
grant execute on function t.as_guest(text, text) to anon, authenticated;
-- Supabase Auth writes auth.users; the NUST / Guest label is read from it, never from the client.
insert into auth.users (id, email, is_anonymous, email_confirmed_at) values
  ('00000000-0000-0000-0000-00000000000b', 'b@nust.edu.pk', false, now()),
  ('00000000-0000-0000-0000-00000000000d', 'd@seecs.edu.pk', false, now()),
  ('00000000-0000-0000-0000-0000000000a1', null, true, null),
  ('00000000-0000-0000-0000-0000000000a2', null, true, null),
  ('00000000-0000-0000-0000-0000000000a3', null, true, null),
  ('00000000-0000-0000-0000-0000000000a4', null, true, null),
  ('00000000-0000-0000-0000-0000000000a5', null, true, null),
  ('00000000-0000-0000-0000-0000000000a6', null, true, null),
  ('00000000-0000-0000-0000-0000000000a7', null, true, null)
on conflict (id) do nothing;

-- G1: no profile yet -> cannot write anything
select t.as_guest('00000000-0000-0000-0000-0000000000a1');
set role authenticated;
select t.fails($$insert into public.reviews (place_id, display_name, rating) values ('concordia-1-6900', 'Guest One', 4)$$, 'guest without a profile posts');
select t.fails($$insert into public.food_ratings (item_key, cafe_id, rating) values ('c1/chai', 'c1', 4)$$, 'guest without a profile rates');
-- profile name rules: 2 to 20 characters, the usual text rules, nothing official-looking
select t.ok(t.err($$insert into public.profiles (display_name) values ('NUST Official')$$) like '%text not allowed: reserved%', 'guest name "NUST Official" refused');
select t.ok(t.err($$insert into public.profiles (display_name) values ('Adm1n')$$) like '%text not allowed: reserved%', 'guest name "Adm1n" refused');
select t.ok(t.err($$insert into public.profiles (display_name) values ('me@gmail.com')$$) like '%text not allowed: email%', 'guest name with an email refused');
select t.ok(t.err($$insert into public.profiles (display_name) values ('bit.ly/x')$$) like '%text not allowed: link%', 'guest name with a link refused');
select t.ok(t.err($$insert into public.profiles (display_name) values ('0300 1234567')$$) like '%text not allowed: phone%', 'guest name with a phone number refused');
select t.ok(t.err($$insert into public.profiles (display_name) values ('Sh1t')$$) like '%text not allowed: blocked%', 'guest name with a blocked term refused');
select t.fails($$insert into public.profiles (display_name) values ('x')$$, 'guest name of 1 character');
select t.fails($$insert into public.profiles (display_name) values ('abcdefghijklmnopqrstu')$$, 'guest name of 21 characters');
-- user_id from the client is ignored
insert into public.profiles (user_id, display_name) values ('00000000-0000-0000-0000-00000000000b', ' Guest One ');
reset role;
select t.ok((select user_id = '00000000-0000-0000-0000-0000000000a1' and display_name = 'Guest One'
  from public.profiles where display_name = 'Guest One'), 'profile user_id forced to the guest, name trimmed');
select t.ok(not exists (select 1 from public.profiles where user_id = '00000000-0000-0000-0000-00000000000b'), 'guest could not create B''s profile');

-- G1 posts: the name comes from the profile, whatever the client sends
select t.as_guest('00000000-0000-0000-0000-0000000000a1');
set role authenticated;
insert into public.reviews (place_id, display_name, rating, body) values ('concordia-1-6900', 'Student B', 4, 'Nice chai');
select t.ok((select display_name from public.public_reviews where mine) = 'Guest One', 'guest review uses the profile name');
select t.ok((select author from public.public_reviews where mine) = 'guest', 'guest review labelled guest');
select t.ok((select author from public.public_reviews where place_id = 'seecs-ug-block-0148') = 'nust', 'B''s review labelled nust');
select t.ok((select count = 1 and guest_count = 1 from public.place_rating_summary where place_id = 'concordia-1-6900'), 'summary counts the guest review and says so');
select t.ok(t.err($$update public.reviews set body = 'see www.example.com' where place_id = 'concordia-1-6900'$$) like '%text not allowed: link%', 'guest edit with a link refused');
-- private data of others stays private
select t.ok((select count(*) from public.reviews) = 1, 'guest sees only its own raw review');
select t.ok((select count(*) from public.food_ratings) = 0, 'guest sees no one else''s food ratings');
select t.ok((select count(*) from public.profiles) = 1, 'guest sees only its own profile');
select t.ok((select count(*) from public.review_reports) = 0, 'guest sees no one else''s reports');
select t.fails($$select * from public.write_log$$, 'guest reads write_log');
select t.fails($$select * from public.allowed_domains$$, 'guest reads allowed_domains');
with u as (update public.reviews set body = 'hacked' where place_id = 'seecs-ug-block-0148' returning 1)
  select t.ok((select count(*) from u) = 0, 'guest cannot edit B''s review');
-- stricter write limit: 5 an hour (profile + review + 3 ratings = 5, the 6th is refused)
insert into public.food_ratings (item_key, cafe_id, rating) select 'c1/g-' || g, 'c1', 4 from generate_series(1, 3) g;
select t.ok(t.err($$insert into public.food_ratings (item_key, cafe_id, rating) values ('c1/g-4', 'c1', 4)$$) like 'P0429%', 'guest 6th write in an hour refused');
reset role;
select t.ok((select count = 1 and guest_count = 1 from public.food_rating_summary where item_key = 'c1/g-1'), 'food summary counts the guest rating and says so');

-- G2 claims a university email in its token: still a guest, still needs a profile, never labelled nust
select t.as_guest('00000000-0000-0000-0000-0000000000a2', 'g2@nust.edu.pk');
set role authenticated;
select t.fails($$insert into public.reviews (place_id, display_name, rating) values ('retro-8873', 'Student G', 5)$$, 'guest with a university email claim posts without a profile');
insert into public.profiles (display_name) values ('Guest Two');
insert into public.reviews (place_id, display_name, rating) values ('seecs-ug-block-0148', 'Guest Two', 5);
select t.ok((select author from public.public_reviews where mine) = 'guest', 'guest with a university email claim still labelled guest');
reset role;

-- Guest reports weigh half: 5 guest reports keep B's (account) review up, the 6th hides it
do $$
declare
  g text;
begin
  foreach g in array array['a2', 'a3', 'a4', 'a5', 'a6', 'a7'] loop
    perform t.as_guest('00000000-0000-0000-0000-0000000000' || g);
    set local role authenticated;
    if g <> 'a2' then
      insert into public.profiles (display_name) values ('Guest ' || g);
    end if;
    insert into public.review_reports (review_id) select id from public.public_reviews where place_id = 'seecs-ug-block-0148' and author = 'nust';
    reset role;
    if g = 'a6' then
      perform t.ok((select not hidden and report_count = 5 from public.reviews where user_id = '00000000-0000-0000-0000-00000000000b'),
        '5 guest reports: still visible');
    end if;
  end loop;
end;
$$;
select t.ok((select hidden and report_count = 6 from public.reviews where user_id = '00000000-0000-0000-0000-00000000000b'), '6 guest reports: hidden');
select t.ok((select bool_and(by_guest) from public.review_reports
  where review_id = (select id from public.reviews where user_id = '00000000-0000-0000-0000-00000000000b')), 'reports flagged as guest reports');
-- a guest cannot pass its report off as an account report
select t.as_guest('00000000-0000-0000-0000-0000000000a3');
set role authenticated;
insert into public.review_reports (review_id, by_guest) select id, false from public.public_reviews where place_id = 'concordia-1-6900';
reset role;
select t.ok((select by_guest from public.review_reports where user_id = '00000000-0000-0000-0000-0000000000a3'
  and review_id = (select id from public.reviews where place_id = 'concordia-1-6900')), 'by_guest forced to true');
-- stricter report limit
update public.review_limits set guest_reports_per_day = 2;
select t.as_guest('00000000-0000-0000-0000-0000000000a3');
set role authenticated;
select t.ok(t.err($$insert into public.review_reports (review_id) select id from public.public_reviews where place_id = 'seecs-ug-block-0148' and not mine$$) like 'P0429%', 'guest 3rd report in a day refused');
reset role;
update public.review_limits set guest_reports_per_day = 3;

-- delete my data also removes the guest profile
select t.as_guest('00000000-0000-0000-0000-0000000000a1');
set role authenticated;
select public.delete_my_data();
reset role;
select t.ok(not exists (select 1 from public.profiles where user_id = '00000000-0000-0000-0000-0000000000a1')
  and not exists (select 1 from public.reviews where user_id = '00000000-0000-0000-0000-0000000000a1')
  and not exists (select 1 from public.food_ratings where user_id = '00000000-0000-0000-0000-0000000000a1'), 'guest data deleted');
select t.ok(exists (select 1 from public.profiles where user_id = '00000000-0000-0000-0000-0000000000a2'), 'other guests untouched');

-- an upgraded guest (verified university email) gets the NUST label on earlier reviews
update auth.users set is_anonymous = false, email = 'g2@nust.edu.pk', email_confirmed_at = now()
 where id = '00000000-0000-0000-0000-0000000000a2';
select t.ok((select author from public.public_reviews p join public.reviews r using (id)
  where r.user_id = '00000000-0000-0000-0000-0000000000a2') = 'nust', 'upgraded guest labelled nust');
