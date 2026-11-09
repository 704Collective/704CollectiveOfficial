-- SQL36 Josh Ahart lock. Do not run until SQL35 has been applied.
-- Calls lock_banned_person only. No other data changes.
-- Do not run on develop.

begin;

do $$
declare
  v_id uuid := 'd1a3bd43-fff0-4706-b05d-cc9d7c9d45de';
  v_name text;
  v_email text;
  v_domain text;
  v_lock boolean;
begin
  select exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'lock_banned_person'
  ) into v_lock;
  if not v_lock then
    raise exception 'TRIPWIRE: public.lock_banned_person is missing. Run SQL35 first.';
  end if;

  select p.full_name, p.email_lower
  into v_name, v_email
  from public.people p
  where p.id = v_id;

  if v_name is null then
    raise exception 'TRIPWIRE: people % not found.', v_id;
  end if;
  if v_name is distinct from 'Josh Ahart' then
    raise exception 'TRIPWIRE: people % is not the expected person (name mismatch).', v_id;
  end if;

  v_domain := split_part(coalesce(v_email, ''), '@', 2);
  if v_domain is distinct from 'gmail.com' then
    raise exception 'TRIPWIRE: people % keeper email domain is %, expected gmail.com.', v_id, v_domain;
  end if;
end $$;

select public.lock_banned_person(
  'd1a3bd43-fff0-4706-b05d-cc9d7c9d45de'::uuid,
  array[
    'ahart.josh@gmail.com',
    'ahart.josh@gmailc.com',
    'crystal.66@osu.edu',
    'zippy_kiddish.5v@icloud.com'
  ]
);

commit;
