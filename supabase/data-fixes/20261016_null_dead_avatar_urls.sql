-- DATA FIX (prod, one-off, NOT a migration - run by hand after review, never auto-applied)
-- Null out profiles.avatar_url values that point at the dead Supabase project
-- chnpjxwcmxkmcdoivmra.supabase.co, so the UI falls back to initials instead of
-- logging ERR_NAME_NOT_RESOLVED on every page that renders the avatar.
--
-- Census on prod 2026-10-16 (read-only): exactly 3 rows, all under
--   https://chnpjxwcmxkmcdoivmra.supabase.co/storage/v1/object/public/avatars/<id>/avatar.*
--   1f924b62-bd7f-45f8-a6eb-cefb768485ad  h.l.williams@live.com        Heather Williams
--   eefa5526-d636-46de-aba8-11a98d80616c  dak344+other@gmail.com       Damian Kudelka
--   8ef7529a-ac2f-4a86-ad67-de950ed20dc3  frank.galasso.usa@gmail.com  Frank Galasso
-- No people / network_listings / hubs rows reference that host.
--
-- Tripwire: the whole transaction aborts unless the match count is exactly 3 before
-- and exactly 0 after. If someone else's avatar has since been re-pointed at the dead
-- host, the first check fails and nothing changes - re-census and edit the constant.

begin;

do $$
declare
  v_expected constant integer := 3;
  v_before integer;
begin
  select count(*) into v_before
  from public.profiles
  where avatar_url ilike '%chnpjxwcmxkmcdoivmra.supabase.co%';

  if v_before <> v_expected then
    raise exception 'TRIPWIRE: expected % dead-avatar rows, found % - aborting, nothing changed', v_expected, v_before;
  end if;
end $$;

update public.profiles
set avatar_url = null,
    updated_at = now()
where avatar_url ilike '%chnpjxwcmxkmcdoivmra.supabase.co%'
  and id in (
    '1f924b62-bd7f-45f8-a6eb-cefb768485ad',
    'eefa5526-d636-46de-aba8-11a98d80616c',
    '8ef7529a-ac2f-4a86-ad67-de950ed20dc3'
  );

do $$
declare
  v_after integer;
begin
  select count(*) into v_after
  from public.profiles
  where avatar_url ilike '%chnpjxwcmxkmcdoivmra.supabase.co%';

  if v_after <> 0 then
    raise exception 'TRIPWIRE: % dead-avatar rows remain after update - rolling back', v_after;
  end if;
end $$;

-- Review the three rows, then COMMIT; (or ROLLBACK;)
select id, email, full_name, avatar_url, updated_at
from public.profiles
where id in (
  '1f924b62-bd7f-45f8-a6eb-cefb768485ad',
  'eefa5526-d636-46de-aba8-11a98d80616c',
  '8ef7529a-ac2f-4a86-ad67-de950ed20dc3'
);

commit;
