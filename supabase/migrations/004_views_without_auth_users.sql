-- NUST World: the public views stop reading auth.users directly. Run after 003_guest_reviews.sql. Safe to run again.
--
-- 003 joined auth.users in public_reviews, place_rating_summary and food_rating_summary to work out the NUST / Guest
-- label. They only ever returned that label and counts, but the Supabase advisor flags any API-exposed view that
-- reads auth.users ("Exposed Auth Users"). Here the lookup moves into private.author_kind(), which returns nothing
-- but 'nust', 'guest' or null for one user id. The views keep exactly the same columns, so the app is unchanged.

-- ---------------------------------------------------------------------------------------------- the one lookup

-- 'guest' (anonymous account), 'nust' (confirmed email on an allowed domain) or null (anything else, or no account).
create or replace function private.author_kind(uid uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when u.is_anonymous then 'guest'
    when u.email_confirmed_at is not null and exists (
      select 1 from public.allowed_domains d
       where d.domain = lower(substring(u.email from '@([^@]+)$'))
    ) then 'nust'
  end
  from auth.users u
  where u.id = uid;
$$;

-- A function used inside a view runs with the *reader's* EXECUTE right (Postgres checks it for the caller even in a
-- view that reads tables as its owner), so anon and authenticated need it. `private` is not exposed by the API
-- (no /rest/v1/rpc route), and every other function in it keeps EXECUTE revoked from anon.
grant usage on schema private to anon, authenticated;
revoke execute on function private.author_kind(uuid) from public;
grant execute on function private.author_kind(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------------------------- views
-- Same columns, names and types as 003.

create or replace view public.public_reviews with (security_barrier) as
  select r.id, r.place_id, r.display_name, r.rating, r.body, r.created_at, r.updated_at,
         (r.user_id = auth.uid()) as mine,
         private.author_kind(r.user_id) as author
    from public.reviews r
   where not r.hidden;

create or replace view public.place_rating_summary with (security_barrier) as
  select r.place_id, round(avg(r.rating)::numeric, 2)::float8 as avg, count(*)::int as count,
         (count(*) filter (where private.author_kind(r.user_id) = 'guest'))::int as guest_count
    from public.reviews r
   where not r.hidden
   group by r.place_id;

create or replace view public.food_rating_summary with (security_barrier) as
  select f.item_key, f.cafe_id, round(avg(f.rating)::numeric, 2)::float8 as avg, count(*)::int as count,
         (count(*) filter (where private.author_kind(f.user_id) = 'guest'))::int as guest_count
    from public.food_ratings f
   group by f.item_key, f.cafe_id;
