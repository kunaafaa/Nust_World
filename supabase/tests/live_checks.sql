-- Live checks against the real Supabase project (paste into the SQL Editor, or run with the MCP execute_sql tool).
--
-- Everything happens inside one DO block that ALWAYS ends by raising an exception, so every row it writes is
-- rolled back and the database is left exactly as it was. The result is the error message:
--   "LIVE CHECKS: n passed, 0 failed"                  -> all good
--   "LIVE CHECKS: n passed, k failed | <what failed>"  -> something is wrong
--
-- It plays anonymous visitors and signed-in users by switching to the real `anon` / `authenticated` roles and
-- setting request.jwt.claims, the same way PostgREST does for each API request. The test user ids are made up.
--
-- A, B, C, D: students (@seecs.edu.pk / @nust.edu.pk)   X: gmail   S: subdomain of an allowed domain   R: rate test
-- G1..G7: guests (Supabase anonymous users). Needs migrations 001 to 004. The guest part also adds rows to
-- auth.users (private.author_kind() reads the NUST / Guest label from there); they are rolled back with the rest.

do $checks$
declare
  a constant text := 'f0000000-0000-4000-8000-00000000000a';
  b constant text := 'f0000000-0000-4000-8000-00000000000b';
  c constant text := 'f0000000-0000-4000-8000-00000000000c';
  d constant text := 'f0000000-0000-4000-8000-00000000000d';
  x constant text := 'f0000000-0000-4000-8000-0000000000ee';
  s constant text := 'f0000000-0000-4000-8000-0000000000ef';
  r constant text := 'f0000000-0000-4000-8000-0000000000f0';
  place constant text := 'zz-live-check-place';
  cafe constant text := 'zz-live-check-cafe';
  passed int := 0;
  failed text[] := '{}';
  rid uuid;
  n int;
  v text;
  ok boolean;
  i int;
  -- guests (003_guest_reviews.sql): g[1] .. g[7]
  g text[] := array(select 'f0000000-0000-4000-8000-0000000001' || lpad(k::text, 2, '0') from generate_series(1, 7) k);
  gplace constant text := 'zz-live-check-guest';
  brid uuid;
begin
  -- ===================================================================================== anonymous visitor
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  execute 'set local role anon';

  -- private tables are unreadable
  foreach v in array array['reviews', 'food_ratings', 'review_reports', 'write_log', 'allowed_domains',
                           'blocked_terms', 'excluded_places', 'review_limits'] loop
    begin
      execute format('select count(*) from public.%I', v) into n;
      failed := failed || ('anon read public.' || v);
    exception when insufficient_privilege then
      passed := passed + 1;
    end;
  end loop;

  begin
    insert into public.reviews (place_id, display_name, rating) values (place, 'Anon', 5);
    failed := failed || 'anon wrote a review'::text;
  exception when insufficient_privilege then passed := passed + 1;
  end;
  begin
    insert into public.food_ratings (item_key, cafe_id, rating) values (cafe || '/tea', cafe, 5);
    failed := failed || 'anon wrote a food rating'::text;
  exception when insufficient_privilege then passed := passed + 1;
  end;
  begin
    perform public.delete_my_data();
    failed := failed || 'anon called delete_my_data()'::text;
  exception when insufficient_privilege then passed := passed + 1;
  end;
  begin
    perform private.email_allowed();
    failed := failed || 'anon called private.email_allowed()'::text;
  exception when insufficient_privilege then passed := passed + 1;
  end;
  begin
    perform public.text_violation('x');
    failed := failed || 'anon called text_violation()'::text;
  exception when insufficient_privilege then passed := passed + 1;
  end;
  begin
    perform public.rate_limit('write');
    failed := failed || 'anon called rate_limit()'::text;
  exception when insufficient_privilege then passed := passed + 1;
  end;
  -- the public views are readable
  begin
    select count(*) into n from public.public_reviews;
    select count(*) into n from public.place_rating_summary;
    select count(*) into n from public.food_rating_summary;
    passed := passed + 1;
  exception when others then failed := failed || ('anon cannot read the public views: ' || sqlerrm);
  end;
  -- 004: anon may use private.author_kind() (inside the views), but no other function in `private`
  foreach v in array array['private.is_guest()', 'private.can_write()', 'private.name_violation(''x'')'] loop
    begin
      execute 'select ' || v;
      failed := failed || ('anon called ' || v);
    exception when insufficient_privilege then passed := passed + 1;
    end;
  end loop;

  -- 004: no API-exposed view reads auth.users directly (advisor "Exposed Auth Users")
  execute 'reset role';
  select count(*) into n
    from pg_depend dep
    join pg_rewrite rw on rw.oid = dep.objid
    join pg_class vw on vw.oid = rw.ev_class
    join pg_namespace ns on ns.oid = vw.relnamespace
   where dep.refobjid = 'auth.users'::regclass and ns.nspname = 'public';
  if n = 0 then passed := passed + 1; else failed := failed || 'a public view reads auth.users'::text; end if;

  -- ===================================================================================== student A
  execute 'reset role';
  perform set_config('request.jwt.claims',
    json_build_object('sub', a, 'email', 'a@seecs.edu.pk', 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  -- user_id is forced to the caller even if the client sends someone else's
  insert into public.reviews (place_id, user_id, display_name, rating, body)
    values (place, b::uuid, 'Student A', 5, 'Great place to study')
    returning id into rid;
  select (user_id = a::uuid) into ok from public.reviews where id = rid;
  if ok then passed := passed + 1; else failed := failed || 'review user_id not forced to the caller'::text; end if;

  -- link / email / phone rejected in body and display name, with the right reason
  foreach v in array array[
    'body|Visit https://example.com today|link',
    'body|menu at www.example.org|link',
    'body|see example.com for more|link',
    'body|cheap at food dot com|link',
    'body|mail me at someone@gmail.com|email',
    'body|someone (at) gmail|email',
    'body|call 0300 1234567|phone',
    'body|whatsapp +92-300-123-4567|phone',
    'name|me@nust.edu.pk|email',
    'name|bit.ly/abc|link',
    'name|03001234567|phone'] loop
    begin
      if split_part(v, '|', 1) = 'body' then
        insert into public.reviews (place_id, display_name, rating, body)
          values (place || '-t', 'Student A', 4, split_part(v, '|', 2));
      else
        insert into public.reviews (place_id, display_name, rating, body)
          values (place || '-t', split_part(v, '|', 2), 4, '');
      end if;
      failed := failed || ('accepted ' || v);
    exception when check_violation then
      if sqlerrm like '%' || split_part(v, '|', 3) || '%' then
        passed := passed + 1;
      else
        failed := failed || ('wrong reason for ' || v || ': ' || sqlerrm);
      end if;
    end;
  end loop;
  -- the same rules apply when editing
  begin
    update public.reviews set body = 'now at https://spam.example' where id = rid;
    failed := failed || 'edit to add a link was accepted'::text;
  exception when check_violation then passed := passed + 1;
  end;
  -- prayer / medical places refuse reviews
  begin
    insert into public.reviews (place_id, display_name, rating) values ('masjid-5311', 'Student A', 5);
    failed := failed || 'review on an excluded place accepted'::text;
  exception when check_violation then passed := passed + 1;
  end;
  -- cannot report your own review
  begin
    insert into public.review_reports (review_id) values (rid);
    failed := failed || 'reported own review'::text;
  exception when check_violation then passed := passed + 1;
  end;

  insert into public.food_ratings (item_key, cafe_id, rating) values (cafe || '/chai', cafe, 5);

  -- ===================================================================================== student B
  execute 'reset role';
  perform set_config('request.jwt.claims',
    json_build_object('sub', b, 'email', 'b@nust.edu.pk', 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  -- cannot read A's private rows
  select count(*) into n from public.reviews where user_id = a::uuid;
  if n = 0 then passed := passed + 1; else failed := failed || 'B can read A''s reviews row'::text; end if;
  select count(*) into n from public.food_ratings where user_id = a::uuid;
  if n = 0 then passed := passed + 1; else failed := failed || 'B can read A''s food rating'::text; end if;
  begin
    select count(*) into n from public.write_log;
    failed := failed || 'B can read write_log'::text;
  exception when insufficient_privilege then passed := passed + 1;
  end;
  begin
    select count(*) into n from public.allowed_domains;
    failed := failed || 'B can read allowed_domains'::text;
  exception when insufficient_privilege then passed := passed + 1;
  end;
  -- cannot change or delete A's review
  update public.reviews set rating = 1 where id = rid;
  delete from public.reviews where id = rid;
  execute 'reset role';
  select count(*) into n from public.reviews where id = rid and rating = 5;
  if n = 1 then passed := passed + 1; else failed := failed || 'B changed or deleted A''s review'::text; end if;
  execute 'set local role authenticated';
  -- the public view has no user ids, and "mine" is false for someone else's review
  select count(*) into n from information_schema.columns
   where table_schema = 'public' and table_name = 'public_reviews' and column_name = 'user_id';
  if n = 0 then passed := passed + 1; else failed := failed || 'public_reviews exposes user_id'::text; end if;
  select count(*) into n from public.public_reviews where id = rid and not mine;
  if n = 1 then passed := passed + 1; else failed := failed || 'B does not see A''s review as not-mine'::text; end if;

  -- B rates the same place and food item: averages update
  insert into public.reviews (place_id, display_name, rating) values (place, 'Student B', 3);
  insert into public.food_ratings (item_key, cafe_id, rating) values (cafe || '/chai', cafe, 2);
  select count(*) into n from public.place_rating_summary where place_id = place and avg = 4 and count = 2;
  if n = 1 then passed := passed + 1; else failed := failed || 'place average is not 4 from 2 reviews'::text; end if;
  select count(*) into n from public.food_rating_summary where item_key = cafe || '/chai' and avg = 3.5 and count = 2;
  if n = 1 then passed := passed + 1; else failed := failed || 'food average is not 3.5 from 2 ratings'::text; end if;

  -- ===================================================================================== not allowed domains
  execute 'reset role';
  perform set_config('request.jwt.claims',
    json_build_object('sub', x, 'email', 'x@gmail.com', 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    insert into public.reviews (place_id, display_name, rating) values (place, 'Gmail User', 5);
    failed := failed || 'gmail user wrote a review'::text;
  exception when insufficient_privilege then passed := passed + 1;
  end;
  begin
    insert into public.food_ratings (item_key, cafe_id, rating) values (cafe || '/chai', cafe, 1);
    failed := failed || 'gmail user wrote a food rating'::text;
  exception when insufficient_privilege then passed := passed + 1;
  end;
  begin
    insert into public.review_reports (review_id) values (rid);
    failed := failed || 'gmail user reported a review'::text;
  exception when insufficient_privilege then passed := passed + 1;
  end;

  execute 'reset role';
  perform set_config('request.jwt.claims',
    json_build_object('sub', s, 'email', 's@evil.nust.edu.pk', 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    insert into public.reviews (place_id, display_name, rating) values (place, 'Sub Domain', 5);
    failed := failed || 'subdomain user wrote a review'::text;
  exception when insufficient_privilege then passed := passed + 1;
  end;

  -- ===================================================================================== rate limit
  execute 'reset role';
  select writes_per_hour into n from public.review_limits; -- 10 by default
  perform set_config('request.jwt.claims',
    json_build_object('sub', r, 'email', 'r@seecs.edu.pk', 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    for i in 1..n loop
      insert into public.food_ratings (item_key, cafe_id, rating) values (cafe || '/item-' || i, cafe, 4);
    end loop;
    passed := passed + 1;
  exception when others then failed := failed || ('writes under the limit refused: ' || sqlerrm);
  end;
  begin
    insert into public.food_ratings (item_key, cafe_id, rating) values (cafe || '/one-too-many', cafe, 4);
    failed := failed || ('write number ' || (n + 1) || ' in an hour was accepted');
  exception when sqlstate 'P0429' then passed := passed + 1;
  end;
  -- editing counts too (stops someone flipping a rating back and forth)
  begin
    update public.food_ratings set rating = 1 where item_key = cafe || '/item-1';
    failed := failed || 'edit over the limit was accepted'::text;
  exception when sqlstate 'P0429' then passed := passed + 1;
  end;

  -- ===================================================================================== 3 reports hide a review
  -- B reports A's review (1), B again (refused: one report per person), C (2), D (3 -> hidden)
  execute 'reset role';
  perform set_config('request.jwt.claims',
    json_build_object('sub', b, 'email', 'b@nust.edu.pk', 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into public.review_reports (review_id, reason) values (rid, 'spam');
  begin
    insert into public.review_reports (review_id, reason) values (rid, 'spam again');
    failed := failed || 'same person reported twice'::text;
  exception when unique_violation then passed := passed + 1;
  end;

  execute 'reset role';
  perform set_config('request.jwt.claims',
    json_build_object('sub', c, 'email', 'c@seecs.edu.pk', 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into public.review_reports (review_id) values (rid);
  select count(*) into n from public.public_reviews where id = rid;
  if n = 1 then passed := passed + 1; else failed := failed || 'review hidden after only 2 reports'::text; end if;

  execute 'reset role';
  perform set_config('request.jwt.claims',
    json_build_object('sub', d, 'email', 'd@nust.edu.pk', 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into public.review_reports (review_id) values (rid);
  -- D only sees their own report
  select count(*) into n from public.review_reports where review_id = rid;
  if n = 1 then passed := passed + 1; else failed := failed || 'D can see other people''s reports'::text; end if;

  -- anon no longer sees it, and the average drops it
  execute 'reset role';
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  execute 'set local role anon';
  select count(*) into n from public.public_reviews where id = rid;
  if n = 0 then passed := passed + 1; else failed := failed || 'review still public after 3 reports'::text; end if;
  select count(*) into n from public.place_rating_summary where place_id = place and avg = 3 and count = 1;
  if n = 1 then passed := passed + 1; else failed := failed || 'hidden review still in the place average'::text; end if;

  -- A (the author) still sees it and cannot unhide it
  execute 'reset role';
  perform set_config('request.jwt.claims',
    json_build_object('sub', a, 'email', 'a@seecs.edu.pk', 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.reviews where id = rid and hidden;
  if n = 1 then passed := passed + 1; else failed := failed || 'author cannot see their hidden review'::text; end if;
  begin
    update public.reviews set hidden = false, report_count = 0, body = 'edited' where id = rid;
  exception when others then null; -- a refusal is fine too
  end;
  execute 'reset role';
  select count(*) into n from public.reviews where id = rid and hidden and report_count = 3;
  if n = 1 then passed := passed + 1; else failed := failed || 'author un-hid their review'::text; end if;

  -- ===================================================================================== guests
  -- Supabase Auth writes auth.users; the NUST / Guest label is read from it. These rows roll back with the rest.
  execute 'reset role';
  insert into auth.users (id, email, is_anonymous, email_confirmed_at)
    values (b::uuid, 'b@nust.edu.pk', false, now());
  insert into auth.users (id, is_anonymous) select gid::uuid, true from unnest(g) as t(gid);

  -- G1, no profile yet: cannot write
  perform set_config('request.jwt.claims',
    json_build_object('sub', g[1], 'role', 'authenticated', 'is_anonymous', true)::text, true);
  execute 'set local role authenticated';
  begin
    insert into public.reviews (place_id, display_name, rating) values (gplace, 'Guest One', 4);
    failed := failed || 'guest without a profile wrote a review'::text;
  exception when insufficient_privilege then passed := passed + 1;
  end;
  begin
    insert into public.food_ratings (item_key, cafe_id, rating) values (cafe || '/guest-chai', cafe, 4);
    failed := failed || 'guest without a profile rated food'::text;
  exception when insufficient_privilege then passed := passed + 1;
  end;
  -- name rules
  foreach v in array array['NUST Official|reserved', 'Adm1n|reserved', 'me@gmail.com|email',
                           'bit.ly/x|link', '0300 1234567|phone'] loop
    begin
      insert into public.profiles (display_name) values (split_part(v, '|', 1));
      failed := failed || ('guest name accepted: ' || v);
    exception when check_violation then
      if sqlerrm like '%' || split_part(v, '|', 2) || '%' then passed := passed + 1;
      else failed := failed || ('wrong reason for guest name ' || v || ': ' || sqlerrm); end if;
    end;
  end loop;
  begin
    insert into public.profiles (display_name) values ('abcdefghijklmnopqrstu');
    failed := failed || 'guest name of 21 characters accepted'::text;
  exception when check_violation then passed := passed + 1;
  end;
  -- user_id forced; the review carries the profile name and the Guest label
  insert into public.profiles (user_id, display_name) values (b::uuid, 'Guest One');
  insert into public.reviews (place_id, display_name, rating) values (gplace, 'Student B', 4);
  select count(*) into n from public.public_reviews
   where place_id = gplace and mine and display_name = 'Guest One' and author = 'guest';
  if n = 1 then passed := passed + 1; else failed := failed || 'guest review not named / labelled from its profile'::text; end if;
  -- private data of others stays private
  select count(*) into n from public.profiles;
  if n = 1 then passed := passed + 1; else failed := failed || 'guest sees other profiles'::text; end if;
  select count(*) into n from public.reviews where user_id <> g[1]::uuid;
  if n = 0 then passed := passed + 1; else failed := failed || 'guest reads others'' raw reviews'::text; end if;
  select count(*) into n from public.food_ratings where user_id <> g[1]::uuid;
  if n = 0 then passed := passed + 1; else failed := failed || 'guest reads others'' food ratings'::text; end if;
  begin
    select count(*) into n from public.write_log;
    failed := failed || 'guest reads write_log'::text;
  exception when insufficient_privilege then passed := passed + 1;
  end;
  -- stricter limit: profile + review = 2 writes, 3 more fit, the 6th is refused
  begin
    for i in 1..3 loop
      insert into public.food_ratings (item_key, cafe_id, rating) values (cafe || '/guest-' || i, cafe, 4);
    end loop;
    passed := passed + 1;
  exception when others then failed := failed || ('guest writes under the limit refused: ' || sqlerrm);
  end;
  begin
    insert into public.food_ratings (item_key, cafe_id, rating) values (cafe || '/guest-4', cafe, 4);
    failed := failed || 'guest 6th write in an hour accepted'::text;
  exception when sqlstate 'P0429' then passed := passed + 1;
  end;
  execute 'reset role';
  select count(*) into n from auth.users where id = b::uuid; -- (sanity: rows are there for the labels)
  select count(*) into n from public.profiles where user_id = b::uuid;
  if n = 0 then passed := passed + 1; else failed := failed || 'guest created a profile for B'::text; end if;
  select count(*) into n from public.place_rating_summary where place_id = gplace and guest_count = 1 and count = 1;
  if n = 1 then passed := passed + 1; else failed := failed || 'place summary does not count the guest'::text; end if;
  select count(*) into n from public.food_rating_summary where item_key = cafe || '/guest-1' and guest_count = 1;
  if n = 1 then passed := passed + 1; else failed := failed || 'food summary does not count the guest'::text; end if;

  -- G2 claims a university email in its token: still a guest, never NUST
  perform set_config('request.jwt.claims',
    json_build_object('sub', g[2], 'email', 'g2@nust.edu.pk', 'role', 'authenticated', 'is_anonymous', true)::text, true);
  execute 'set local role authenticated';
  begin
    insert into public.reviews (place_id, display_name, rating) values (gplace, 'Student G', 5);
    failed := failed || 'guest with a university email claim wrote without a profile'::text;
  exception when insufficient_privilege then passed := passed + 1;
  end;
  execute 'reset role';

  -- B (verified) posts; 5 guest reports keep it up, the 6th hides it (a guest report weighs half)
  perform set_config('request.jwt.claims',
    json_build_object('sub', b, 'email', 'b@nust.edu.pk', 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into public.reviews (place_id, display_name, rating) values (gplace, 'Student B', 2) returning id into brid;
  select count(*) into n from public.public_reviews where id = brid and author = 'nust';
  if n = 1 then passed := passed + 1; else failed := failed || 'verified review not labelled nust'::text; end if;
  execute 'reset role';
  for i in 2..7 loop
    perform set_config('request.jwt.claims',
      json_build_object('sub', g[i], 'role', 'authenticated', 'is_anonymous', true)::text, true);
    execute 'set local role authenticated';
    insert into public.profiles (display_name) values ('Guest ' || i);
    insert into public.review_reports (review_id, by_guest) values (brid, false); -- by_guest is forced anyway
    execute 'reset role';
    if i = 6 then
      select count(*) into n from public.reviews where id = brid and not hidden and report_count = 5;
      if n = 1 then passed := passed + 1; else failed := failed || '5 guest reports hid a review'::text; end if;
    end if;
  end loop;
  select count(*) into n from public.reviews where id = brid and hidden and report_count = 6;
  if n = 1 then passed := passed + 1; else failed := failed || '6 guest reports did not hide the review'::text; end if;
  select count(*) into n from public.review_reports where review_id = brid and not by_guest;
  if n = 0 then passed := passed + 1; else failed := failed || 'a guest report passed as an account report'::text; end if;

  -- delete my data removes the guest profile too
  perform set_config('request.jwt.claims',
    json_build_object('sub', g[1], 'role', 'authenticated', 'is_anonymous', true)::text, true);
  execute 'set local role authenticated';
  perform public.delete_my_data();
  execute 'reset role';
  select count(*) into n from public.profiles where user_id = g[1]::uuid;
  select n + count(*) into n from public.reviews where user_id = g[1]::uuid;
  select n + count(*) into n from public.food_ratings where user_id = g[1]::uuid;
  if n = 0 then passed := passed + 1; else failed := failed || 'guest data left after delete_my_data'::text; end if;

  -- ===================================================================================== result (always rolls back)
  execute 'reset role';
  raise exception 'LIVE CHECKS: % passed, % failed%', passed, coalesce(array_length(failed, 1), 0),
    case when array_length(failed, 1) > 0 then ' | ' || array_to_string(failed, ' | ') else '' end;
end;
$checks$;
