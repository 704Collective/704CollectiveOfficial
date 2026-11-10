-- SQL37 ambassadors.created_by unblock. Already applied on prod. Do not run.
-- Record only: Downloads copy was not present, reconstructed from the applied
-- prod constraint (NO ACTION -> ON DELETE SET NULL) so locked auth users can
-- be deleted without 23503.
-- Do not run on develop.

begin;

-- TRIPWIRE 1: abort if the FK is already SET NULL (already applied).
do $$
declare
  v_def text;
begin
  select pg_get_constraintdef(con.oid) into v_def
  from pg_constraint con
  join pg_class c on c.oid = con.conrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'ambassadors'
    and con.conname = 'ambassadors_created_by_fkey';
  if v_def is null then
    raise exception 'TRIPWIRE 1: ambassadors_created_by_fkey is missing.';
  end if;
  if position('ON DELETE SET NULL' in v_def) > 0 then
    raise exception 'TRIPWIRE 1: ambassadors_created_by_fkey is already ON DELETE SET NULL. Abort.';
  end if;
end $$;

alter table public.ambassadors
  drop constraint ambassadors_created_by_fkey;

alter table public.ambassadors
  add constraint ambassadors_created_by_fkey
  foreign key (created_by) references auth.users(id) on delete set null;

-- TRIPWIRE 2: FK must now SET NULL.
do $$
declare
  v_def text;
begin
  select pg_get_constraintdef(con.oid) into v_def
  from pg_constraint con
  join pg_class c on c.oid = con.conrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'ambassadors'
    and con.conname = 'ambassadors_created_by_fkey';
  if position('ON DELETE SET NULL' in coalesce(v_def, '')) = 0 then
    raise exception 'TRIPWIRE 2: ambassadors_created_by_fkey is not ON DELETE SET NULL.';
  end if;
end $$;

commit;
