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
