-- Local test harness only (pglite in tests/reviewsDb.test.ts). Supabase already provides all of this:
-- the auth schema, auth.uid(), auth.jwt() and the anon / authenticated roles. Never run this on Supabase.
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key, email text);
-- the two columns 003_guest_reviews.sql reads for the NUST / Guest label (same names and types as Supabase)
alter table auth.users add column if not exists is_anonymous boolean not null default false;
alter table auth.users add column if not exists email_confirmed_at timestamptz;
create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb;
$$;
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid;
$$;
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
end;
$$;
grant usage on schema public to anon, authenticated;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid(), auth.jwt() to anon, authenticated;
