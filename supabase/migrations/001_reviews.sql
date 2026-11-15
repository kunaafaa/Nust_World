-- NUST World: place reviews and food ratings.
--
-- Run once in the Supabase SQL editor (or `supabase db push`). Then run supabase/seed/*.sql.
-- See docs/REVIEWS_SETUP.md. The app only ever uses the anon key; everything below is enforced here, in the
-- database, so a modified client cannot get around it.
--
-- What is stored: the Supabase user id, the display name the person typed, and their rating / text.
-- No email, no location, no device data. delete_my_data() removes every row a person owns.
--
-- Text rules (mirrored in src/lib/reviews/textCheck.ts, shared cases in supabase/tests/text-cases.json):
-- normalise (NFKC, lower case), then reject control / zero-width characters, email addresses, links, phone
-- numbers and blocked terms (checked in that order).

-- ---------------------------------------------------------------------------------------------- settings

create table if not exists public.allowed_domains (
  domain text primary key check (domain ~ '^[a-z0-9.-]+\.[a-z]{2,}$')
);

-- One row, editable by the project owner only (no policies = no access for anon/authenticated).
create table if not exists public.review_limits (
  id boolean primary key default true check (id),
  writes_per_hour int not null default 10,
  reports_per_day int not null default 20,
  hide_after_reports int not null default 3
);
insert into public.review_limits (id) values (true) on conflict (id) do nothing;

create table if not exists public.blocked_terms (
  term text primary key check (term ~ '^[a-z]+( [a-z]+)*$')
);

-- Places that must never be reviewed (prayer and medical). Generated: supabase/seed/excluded_places.sql.
create table if not exists public.excluded_places (
  place_id text primary key
);

-- ---------------------------------------------------------------------------------------------- content

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  place_id text not null check (place_id ~ '^[a-z0-9][a-z0-9-]{0,79}$'),
  user_id uuid not null default auth.uid(),
  display_name text not null check (char_length(display_name) between 2 and 40),
  rating smallint not null check (rating between 1 and 5),
  body text not null default '' check (char_length(body) <= 500),
  hidden boolean not null default false,
  report_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (place_id, user_id)
);
create index if not exists reviews_place_idx on public.reviews (place_id) where not hidden;

create table if not exists public.food_ratings (
  item_key text not null check (item_key ~ '^[a-z0-9-]{1,40}/[a-z0-9~-]{1,120}$'),
  cafe_id text not null check (cafe_id ~ '^[a-z0-9-]{1,40}$'),
  user_id uuid not null default auth.uid(),
  rating smallint not null check (rating between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (item_key, user_id),
  check (split_part(item_key, '/', 1) = cafe_id)
);
create index if not exists food_ratings_cafe_idx on public.food_ratings (cafe_id);

create table if not exists public.review_reports (
  review_id uuid not null references public.reviews (id) on delete cascade,
  user_id uuid not null default auth.uid(),
  reason text not null default '' check (char_length(reason) <= 200),
  created_at timestamptz not null default now(),
  primary key (review_id, user_id)
);

-- Rate-limit bookkeeping. Rows older than a day are pruned on write.
create table if not exists public.write_log (
  user_id uuid not null,
  kind text not null check (kind in ('write', 'report')),
  at timestamptz not null default now()
);
create index if not exists write_log_user_idx on public.write_log (user_id, kind, at);

-- ---------------------------------------------------------------------------------------------- helpers

-- The caller's email domain is in allowed_domains.
create or replace function public.email_allowed() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.allowed_domains d
    where d.domain = lower(split_part(coalesce(auth.jwt() ->> 'email', ''), '@', 2))
  );
$$;

-- null = text is fine, otherwise the reason: control | link | email | phone | blocked
create or replace function public.text_violation(t text) returns text
language plpgsql stable security definer set search_path = public as $$
declare
  s text;
  w text;
  j text;
  term text;
begin
  if t is null or t = '' then
    return null;
  end if;
  s := lower(normalize(t, NFKC));
  if s ~ '[\x01-\x08\x0b\x0c\x0e-\x1f\x7f​-‏⁠﻿]' then
    return 'control';
  end if;
  if s ~ '([a-z0-9._%+-]@|@[a-z0-9-]+\.|\(at\)|\[at\])' then
    return 'email';
  end if;
  if s ~ '(https?:|www\.|\.(com|net|org|pk|io|co|me|ly|app|dev|xyz|info|link|site|online|gg)([^a-z]|$)|(^|[^a-z])dot\s*(com|net|org|pk)([^a-z]|$))' then
    return 'link';
  end if;
  if regexp_replace(s, '[\s().-]', '', 'g') ~ '[0-9]{7,}' then
    return 'phone';
  end if;
  w := translate(s, '0134578@$!', 'oieastbasi');
  w := regexp_replace(w, '[^a-z]+', ' ', 'g');
  w := regexp_replace(w, '([a-z])\1+', '\1', 'g');
  w := ' ' || btrim(w) || ' ';
  j := replace(w, ' ', '');
  for term in select regexp_replace(b.term, '([a-z])\1+', '\1', 'g') from public.blocked_terms b loop
    if position(' ' || term || ' ' in w) > 0 or (char_length(term) >= 5 and position(term in j) > 0) then
      return 'blocked';
    end if;
  end loop;
  return null;
end;
$$;

-- Count this user's recent writes of a kind; raise if over the limit, otherwise log one more.
create or replace function public.rate_limit(k text) returns void
language plpgsql security definer set search_path = public as $$
declare
  lim int;
  win interval;
  n int;
begin
  if k = 'write' then
    select writes_per_hour, interval '1 hour' into lim, win from public.review_limits;
  else
    select reports_per_day, interval '1 day' into lim, win from public.review_limits;
  end if;
  delete from public.write_log where user_id = auth.uid() and at < now() - interval '1 day';
  select count(*) into n from public.write_log where user_id = auth.uid() and kind = k and at > now() - win;
  if n >= lim then
    raise exception 'rate limit: too many % actions, try again later', k using errcode = 'P0429';
  end if;
  insert into public.write_log (user_id, kind) values (auth.uid(), k);
end;
$$;

-- ---------------------------------------------------------------------------------------------- triggers

create or replace function public.reviews_before_write() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v text;
begin
  if tg_op = 'UPDATE' and pg_trigger_depth() > 1 then
    return new; -- the report recount below (reports_after_insert), not a user edit
  end if;
  new.user_id := auth.uid(); -- never trust the client
  new.display_name := btrim(new.display_name);
  new.body := btrim(coalesce(new.body, ''));
  if tg_op = 'INSERT' then
    if exists (select 1 from public.excluded_places e where e.place_id = new.place_id) then
      raise exception 'this place does not take reviews' using errcode = '23514';
    end if;
    new.hidden := false;
    new.report_count := 0;
    new.created_at := now();
  else
    new.id := old.id;
    new.place_id := old.place_id;
    new.hidden := old.hidden;
    new.report_count := old.report_count;
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  v := coalesce(public.text_violation(new.display_name), public.text_violation(new.body));
  if v is not null then
    raise exception 'text not allowed: %', v using errcode = '23514';
  end if;
  perform public.rate_limit('write');
  return new;
end;
$$;
drop trigger if exists reviews_before_write on public.reviews;
create trigger reviews_before_write before insert or update on public.reviews
  for each row execute function public.reviews_before_write();

create or replace function public.food_ratings_before_write() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.user_id := auth.uid();
  if tg_op = 'INSERT' then
    new.created_at := now();
  else
    new.item_key := old.item_key;
    new.cafe_id := old.cafe_id;
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  perform public.rate_limit('write');
  return new;
end;
$$;
drop trigger if exists food_ratings_before_write on public.food_ratings;
create trigger food_ratings_before_write before insert or update on public.food_ratings
  for each row execute function public.food_ratings_before_write();

create or replace function public.reports_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v text;
begin
  new.user_id := auth.uid();
  new.reason := btrim(coalesce(new.reason, ''));
  new.created_at := now();
  if exists (select 1 from public.reviews r where r.id = new.review_id and r.user_id = auth.uid()) then
    raise exception 'you cannot report your own review' using errcode = '23514';
  end if;
  v := public.text_violation(new.reason);
  if v is not null then
    raise exception 'text not allowed: %', v using errcode = '23514';
  end if;
  perform public.rate_limit('report');
  return new;
end;
$$;
drop trigger if exists reports_before_insert on public.review_reports;
create trigger reports_before_insert before insert on public.review_reports
  for each row execute function public.reports_before_insert();

-- Recount after each report; hide at the threshold (the author still sees their own hidden review).
create or replace function public.reports_after_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  n int;
begin
  select count(*) into n from public.review_reports where review_id = new.review_id;
  update public.reviews
     set report_count = n,
         hidden = hidden or n >= (select hide_after_reports from public.review_limits)
   where id = new.review_id;
  return null;
end;
$$;
drop trigger if exists reports_after_insert on public.review_reports;
create trigger reports_after_insert after insert on public.review_reports
  for each row execute function public.reports_after_insert();

-- ---------------------------------------------------------------------------------------------- views

-- Public reading goes through these views only: no user ids leave the database.
create or replace view public.public_reviews with (security_barrier) as
  select r.id, r.place_id, r.display_name, r.rating, r.body, r.created_at, r.updated_at,
         (r.user_id = auth.uid()) as mine
    from public.reviews r
   where not r.hidden;

create or replace view public.place_rating_summary with (security_barrier) as
  select place_id, round(avg(rating)::numeric, 2)::float8 as avg, count(*)::int as count
    from public.reviews
   where not hidden
   group by place_id;

create or replace view public.food_rating_summary with (security_barrier) as
  select item_key, cafe_id, round(avg(rating)::numeric, 2)::float8 as avg, count(*)::int as count
    from public.food_ratings
   group by item_key, cafe_id;

-- ---------------------------------------------------------------------------------------------- rpc

create or replace function public.delete_my_data() returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  delete from public.review_reports where user_id = auth.uid();
  delete from public.reviews where user_id = auth.uid();
  delete from public.food_ratings where user_id = auth.uid();
  delete from public.write_log where user_id = auth.uid();
end;
$$;

-- ---------------------------------------------------------------------------------------------- access

alter table public.allowed_domains enable row level security;
alter table public.review_limits enable row level security;
alter table public.blocked_terms enable row level security;
alter table public.excluded_places enable row level security;
alter table public.reviews enable row level security;
alter table public.food_ratings enable row level security;
alter table public.review_reports enable row level security;
alter table public.write_log enable row level security;

-- Start from nothing, then grant exactly what the app needs.
revoke all on public.allowed_domains, public.review_limits, public.blocked_terms, public.excluded_places,
  public.reviews, public.food_ratings, public.review_reports, public.write_log from anon, authenticated;
revoke all on public.public_reviews, public.place_rating_summary, public.food_rating_summary from anon, authenticated;
revoke execute on function public.email_allowed(), public.text_violation(text), public.rate_limit(text),
  public.delete_my_data() from public, anon, authenticated;

grant select on public.public_reviews, public.place_rating_summary, public.food_rating_summary to anon, authenticated;
grant select, insert, update, delete on public.reviews to authenticated;
grant select, insert, update, delete on public.food_ratings to authenticated;
grant select, insert on public.review_reports to authenticated;
grant execute on function public.delete_my_data() to authenticated;
grant execute on function public.email_allowed() to authenticated;

drop policy if exists reviews_own_select on public.reviews;
create policy reviews_own_select on public.reviews for select to authenticated
  using (user_id = auth.uid());
drop policy if exists reviews_own_insert on public.reviews;
create policy reviews_own_insert on public.reviews for insert to authenticated
  with check (user_id = auth.uid() and public.email_allowed());
drop policy if exists reviews_own_update on public.reviews;
create policy reviews_own_update on public.reviews for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.email_allowed());
drop policy if exists reviews_own_delete on public.reviews;
create policy reviews_own_delete on public.reviews for delete to authenticated
  using (user_id = auth.uid());

drop policy if exists food_own_select on public.food_ratings;
create policy food_own_select on public.food_ratings for select to authenticated
  using (user_id = auth.uid());
drop policy if exists food_own_insert on public.food_ratings;
create policy food_own_insert on public.food_ratings for insert to authenticated
  with check (user_id = auth.uid() and public.email_allowed());
drop policy if exists food_own_update on public.food_ratings;
create policy food_own_update on public.food_ratings for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.email_allowed());
drop policy if exists food_own_delete on public.food_ratings;
create policy food_own_delete on public.food_ratings for delete to authenticated
  using (user_id = auth.uid());

drop policy if exists reports_own_select on public.review_reports;
create policy reports_own_select on public.review_reports for select to authenticated
  using (user_id = auth.uid());
drop policy if exists reports_own_insert on public.review_reports;
create policy reports_own_insert on public.review_reports for insert to authenticated
  with check (user_id = auth.uid() and public.email_allowed());
