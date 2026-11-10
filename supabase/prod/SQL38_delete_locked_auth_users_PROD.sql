-- SQL38 delete locked auth users. Already applied on prod. Do not run.
-- Record only: Downloads copy was not present, reconstructed from the three
-- locked auth ids that SQL36 targeted. Deletes auth.users rows only.
-- Do not run on develop.

begin;

-- TRIPWIRE 1: abort if none of the locked auth users remain (already applied).
do $$
declare
  v_n int;
begin
  select count(*) into v_n
  from auth.users
  where id in (
    'a5f1b294-0d89-4825-873c-e5d484725c76'::uuid,
    '28676f75-abbc-4ab7-88e8-395c230f0542'::uuid,
    'c4e41d01-3c2f-4490-80b7-4a41634e6b9a'::uuid
  );
  if v_n = 0 then
    raise exception 'TRIPWIRE 1: locked auth users already absent. Abort.';
  end if;
end $$;

delete from auth.users
where id in (
  'a5f1b294-0d89-4825-873c-e5d484725c76'::uuid,
  '28676f75-abbc-4ab7-88e8-395c230f0542'::uuid,
  'c4e41d01-3c2f-4490-80b7-4a41634e6b9a'::uuid
);

-- TRIPWIRE 2: those ids must be gone.
do $$
declare
  v_n int;
begin
  select count(*) into v_n
  from auth.users
  where id in (
    'a5f1b294-0d89-4825-873c-e5d484725c76'::uuid,
    '28676f75-abbc-4ab7-88e8-395c230f0542'::uuid,
    'c4e41d01-3c2f-4490-80b7-4a41634e6b9a'::uuid
  );
  if v_n > 0 then
    raise exception 'TRIPWIRE 2: % locked auth user(s) still present.', v_n;
  end if;
end $$;

commit;
