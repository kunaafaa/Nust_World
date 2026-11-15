-- NUST World: fixes from the Supabase security and performance advisors. Run after 001_reviews.sql.
-- Safe to run more than once. See docs/REVIEWS_SETUP.md ("Advisor notes") for what was left alone and why.

-- ---------------------------------------------------------------------------------------- private helpers

-- email_allowed() is only needed inside RLS policies, so it moves out of the API schema (`public` is served by
-- PostgREST as /rest/v1/rpc/*). `private` is not exposed; signed-in users only get the usage policies need.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create or replace function private.email_allowed() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.allowed_domains d
    where d.domain = lower(split_part(coalesce((select auth.jwt()) ->> 'email', ''), '@', 2))
  );
$$;
revoke execute on function private.email_allowed() from public, anon;
grant execute on function private.email_allowed() to authenticated;

-- ---------------------------------------------------------------------------------------- policies
-- Same rules as 001, but on private.email_allowed() and with auth.uid() wrapped in a sub-select so Postgres
-- evaluates it once per statement instead of once per row (advisor: auth_rls_initplan).

drop policy if exists reviews_own_select on public.reviews;
create policy reviews_own_select on public.reviews for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists reviews_own_insert on public.reviews;
create policy reviews_own_insert on public.reviews for insert to authenticated
  with check (user_id = (select auth.uid()) and (select private.email_allowed()));
drop policy if exists reviews_own_update on public.reviews;
create policy reviews_own_update on public.reviews for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and (select private.email_allowed()));
drop policy if exists reviews_own_delete on public.reviews;
create policy reviews_own_delete on public.reviews for delete to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists food_own_select on public.food_ratings;
create policy food_own_select on public.food_ratings for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists food_own_insert on public.food_ratings;
create policy food_own_insert on public.food_ratings for insert to authenticated
  with check (user_id = (select auth.uid()) and (select private.email_allowed()));
drop policy if exists food_own_update on public.food_ratings;
create policy food_own_update on public.food_ratings for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and (select private.email_allowed()));
drop policy if exists food_own_delete on public.food_ratings;
create policy food_own_delete on public.food_ratings for delete to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists reports_own_select on public.review_reports;
create policy reports_own_select on public.review_reports for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists reports_own_insert on public.review_reports;
create policy reports_own_insert on public.review_reports for insert to authenticated
  with check (user_id = (select auth.uid()) and (select private.email_allowed()));

-- Nothing references the public copy any more.
drop function if exists public.email_allowed();

-- ---------------------------------------------------------------------------------------- execute grants
-- Trigger functions run when their trigger fires whatever the caller's EXECUTE rights, so nobody needs them
-- over the API (advisor: anon/authenticated_security_definer_function_executable).
revoke execute on function public.reviews_before_write(), public.food_ratings_before_write(),
  public.reports_before_insert(), public.reports_after_insert() from public, anon, authenticated;

-- Supabase's own event-trigger helper (created with the project). Same reasoning: event triggers do not need it.
do $$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'rls_auto_enable' and p.pronargs = 0) then
    execute 'revoke execute on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------------------- write_log key
-- advisor: no_primary_key. Nothing reads the id; rate_limit() names its columns on insert.
alter table public.write_log add column if not exists id bigint generated always as identity primary key;
