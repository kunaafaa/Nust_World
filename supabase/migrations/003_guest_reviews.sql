-- NUST World: guest reviews. Run after 001_reviews.sql and 002_advisor_fixes.sql. Safe to run more than once.
--
-- Guests are Supabase anonymous users (Auth → Sign In / Providers → "Allow anonymous sign-ins", with the Turnstile
-- captcha on, so every new guest solved a captcha). Their access token says is_anonymous = true.
--
-- - A guest may write once they have a profile (display name, 2 to 20 characters, same text rules, and no names
--   that pass as official: "NUST ...", "admin", "moderator" ...). Their reviews always carry that profile name.
-- - Guests get stricter limits (review_limits.guest_*), and a guest report weighs less toward auto-hide, so a few
--   captchas cannot hide someone's review.
-- - The "NUST" / "Guest" label is worked out when reading, from auth.users (is_anonymous, email_confirmed_at, email
--   domain). Nothing the client sends can set it, and a guest who later verifies a university email gets the NUST
--   label on their earlier reviews too.

-- ---------------------------------------------------------------------------------------------- settings

alter table public.review_limits
  add column if not exists guest_writes_per_hour int not null default 5,
  add column if not exists guest_reports_per_day int not null default 3,
  add column if not exists guest_report_weight numeric(3, 2) not null default 0.5
    check (guest_report_weight between 0 and 1);

-- ---------------------------------------------------------------------------------------------- helpers

-- The caller is a Supabase anonymous (guest) user.
create or replace function private.is_guest() returns boolean
language sql stable set search_path = '' as $$
  select coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false);
$$;
revoke execute on function private.is_guest() from public, anon;
grant execute on function private.is_guest() to authenticated;

-- Email users only: a guest never counts as a university account, whatever its token carries.
create or replace function private.email_allowed() returns boolean
language sql stable security definer set search_path = public as $$
  select not private.is_guest() and exists (
    select 1 from public.allowed_domains d
    where d.domain = lower(split_part(coalesce((select auth.jwt()) ->> 'email', ''), '@', 2))
  );
$$;

-- Guest display names: the usual text rules, plus nothing that passes as official.
-- null = fine, otherwise the reason (control | link | email | phone | blocked | reserved)
create or replace function private.name_violation(t text) returns text
language plpgsql stable security definer set search_path = public as $$
declare
  w text;
begin
  if public.text_violation(t) is not null then
    return public.text_violation(t);
  end if;
  w := translate(lower(normalize(coalesce(t, ''), NFKC)), '0134578@$!', 'oieastbasi');
  w := ' ' || btrim(regexp_replace(w, '[^a-z]+', ' ', 'g')) || ' ';
  -- whole words (so "Adminah" is fine), plus anything starting with "nust" ("NUSTian")
  if w ~ ' (nust[a-z]*|admins?|administrators?|moderators?|officials?|verified|staff) ' then
    return 'reserved';
  end if;
  return null;
end;
$$;
revoke execute on function private.name_violation(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------- profiles

-- One row per user; only guests need one (their display name). Never readable by anyone else.
create table if not exists public.profiles (
  user_id uuid primary key default auth.uid(),
  display_name text not null check (char_length(display_name) between 2 and 20),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.profiles_before_write() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v text;
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  new.user_id := auth.uid();
  new.display_name := btrim(new.display_name);
  if tg_op = 'INSERT' then
    new.created_at := now();
  else
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  v := private.name_violation(new.display_name);
  if v is not null then
    raise exception 'text not allowed: %', v using errcode = '23514';
  end if;
  perform public.rate_limit('write');
  return new;
end;
$$;
revoke execute on function public.profiles_before_write() from public, anon, authenticated;
drop trigger if exists profiles_before_write on public.profiles;
create trigger profiles_before_write before insert or update on public.profiles
  for each row execute function public.profiles_before_write();

-- Who may write reviews, ratings and reports: university email accounts, or guests with a profile.
create or replace function private.can_write() returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when private.is_guest() then exists (select 1 from public.profiles p where p.user_id = (select auth.uid()))
    else private.email_allowed()
  end;
$$;
revoke execute on function private.can_write() from public, anon;
grant execute on function private.can_write() to authenticated;

-- ---------------------------------------------------------------------------------------------- limits

create or replace function public.rate_limit(k text) returns void
language plpgsql security definer set search_path = public as $$
declare
  g boolean := private.is_guest();
  lim int;
  win interval;
  n int;
begin
  if k = 'write' then
    select case when g then guest_writes_per_hour else writes_per_hour end, interval '1 hour'
      into lim, win from public.review_limits;
  else
    select case when g then guest_reports_per_day else reports_per_day end, interval '1 day'
      into lim, win from public.review_limits;
  end if;
  delete from public.write_log where user_id = auth.uid() and at < now() - interval '1 day';
  select count(*) into n from public.write_log where user_id = auth.uid() and kind = k and at > now() - win;
  if n >= lim then
    raise exception 'rate limit: too many % actions, try again later', k using errcode = 'P0429';
  end if;
  insert into public.write_log (user_id, kind) values (auth.uid(), k);
end;
$$;

-- ---------------------------------------------------------------------------------------------- reviews

-- Same as 001, plus: a guest's review always carries their profile name.
create or replace function public.reviews_before_write() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v text;
begin
  if tg_op = 'UPDATE' and pg_trigger_depth() > 1 then
    return new; -- the report recount (reports_after_insert), not a user edit
  end if;
  new.user_id := auth.uid();
  if private.is_guest() then
    new.display_name := (select p.display_name from public.profiles p where p.user_id = auth.uid());
    if new.display_name is null then
      raise exception 'guests need a display name first' using errcode = '42501';
    end if;
  end if;
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

-- ---------------------------------------------------------------------------------------------- reports

alter table public.review_reports add column if not exists by_guest boolean not null default false;

create or replace function public.reports_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v text;
begin
  new.user_id := auth.uid();
  new.by_guest := private.is_guest(); -- never trust the client
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

-- Recount after each report. Hidden once (account reports + guest reports x guest_report_weight) reaches
-- hide_after_reports: 3 account reports, or 6 guest reports at the default weight of 0.5.
create or replace function public.reports_after_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  n int;
  score numeric;
  lim public.review_limits;
begin
  select * into lim from public.review_limits;
  select count(*), coalesce(sum(case when by_guest then lim.guest_report_weight else 1 end), 0)
    into n, score
    from public.review_reports where review_id = new.review_id;
  update public.reviews
     set report_count = n,
         hidden = hidden or score >= lim.hide_after_reports
   where id = new.review_id;
  return null;
end;
$$;

revoke execute on function public.reviews_before_write(), public.reports_before_insert(),
  public.reports_after_insert(), public.rate_limit(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------- views
-- Columns are only appended (create or replace view cannot change existing ones).

create or replace view public.public_reviews with (security_barrier) as
  select r.id, r.place_id, r.display_name, r.rating, r.body, r.created_at, r.updated_at,
         (r.user_id = auth.uid()) as mine,
         case
           when u.is_anonymous then 'guest'
           when u.email_confirmed_at is not null and exists (
             select 1 from public.allowed_domains d
              where d.domain = lower(substring(u.email from '@([^@]+)$'))
           ) then 'nust'
         end as author
    from public.reviews r
    left join auth.users u on u.id = r.user_id
   where not r.hidden;

create or replace view public.place_rating_summary with (security_barrier) as
  select r.place_id, round(avg(r.rating)::numeric, 2)::float8 as avg, count(*)::int as count,
         (count(*) filter (where u.is_anonymous))::int as guest_count
    from public.reviews r
    left join auth.users u on u.id = r.user_id
   where not r.hidden
   group by r.place_id;

create or replace view public.food_rating_summary with (security_barrier) as
  select f.item_key, f.cafe_id, round(avg(f.rating)::numeric, 2)::float8 as avg, count(*)::int as count,
         (count(*) filter (where u.is_anonymous))::int as guest_count
    from public.food_ratings f
    left join auth.users u on u.id = f.user_id
   group by f.item_key, f.cafe_id;

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
  delete from public.profiles where user_id = auth.uid();
  delete from public.write_log where user_id = auth.uid();
end;
$$;
revoke execute on function public.delete_my_data() from public, anon;
grant execute on function public.delete_my_data() to authenticated;

-- ---------------------------------------------------------------------------------------------- access

alter table public.profiles enable row level security;
revoke all on public.profiles from anon, authenticated;
grant select, insert, update on public.profiles to authenticated;

drop policy if exists profiles_own_select on public.profiles;
create policy profiles_own_select on public.profiles for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists profiles_own_insert on public.profiles;
create policy profiles_own_insert on public.profiles for insert to authenticated
  with check (user_id = (select auth.uid()));
drop policy if exists profiles_own_update on public.profiles;
create policy profiles_own_update on public.profiles for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Writes: university accounts, or guests with a profile (private.can_write()).
drop policy if exists reviews_own_insert on public.reviews;
create policy reviews_own_insert on public.reviews for insert to authenticated
  with check (user_id = (select auth.uid()) and (select private.can_write()));
drop policy if exists reviews_own_update on public.reviews;
create policy reviews_own_update on public.reviews for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and (select private.can_write()));

drop policy if exists food_own_insert on public.food_ratings;
create policy food_own_insert on public.food_ratings for insert to authenticated
  with check (user_id = (select auth.uid()) and (select private.can_write()));
drop policy if exists food_own_update on public.food_ratings;
create policy food_own_update on public.food_ratings for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and (select private.can_write()));

drop policy if exists reports_own_insert on public.review_reports;
create policy reports_own_insert on public.review_reports for insert to authenticated
  with check (user_id = (select auth.uid()) and (select private.can_write()));
