-- Single-transaction proofs so jwt settings survive. Counts only.

do $p$
declare
  v_helper uuid;
  v_other uuid;
  v_own uuid := 'e0000000-0000-4000-8000-000000000001';
  v_hid uuid := 'e0000000-0000-4000-8000-000000000002';
  v_list int;
  v_own_see boolean;
  v_hid_see boolean;
  v_is_helper boolean;
  v_is_super boolean;
begin
  select id into v_helper
  from public.profiles
  where email = 'seed-helper@704collective.dev' and deleted_at is null;
  if v_helper is null then
    raise exception 'helper profile missing';
  end if;

  select id into v_other
  from public.profiles
  where role = 'super_admin' and deleted_at is null
  order by created_at
  limit 1;

  insert into public.tm_tasks (id, title, notes, status, size, priority, counts, needs_home, created_by)
  values (v_own, 'SEED helper own task', 'Helper can see this', 'open', 'M', 'normal', true, true, v_helper)
  on conflict (id) do update set created_by = excluded.created_by, deleted_at = null;

  insert into public.tm_task_owners (task_id, profile_id)
  values (v_own, v_helper)
  on conflict do nothing;

  insert into public.tm_tasks (id, title, notes, status, size, priority, counts, needs_home, created_by)
  values (v_hid, 'SEED admin only task', 'Helper must not see this', 'open', 'M', 'normal', true, false, v_other)
  on conflict (id) do update set created_by = excluded.created_by, deleted_at = null;

  insert into public.tm_task_owners (task_id, profile_id)
  values (v_hid, v_other)
  on conflict do nothing;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_helper::text, 'role', 'authenticated')::text,
    true
  );
  perform set_config('request.jwt.claim.sub', v_helper::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  select count(*) into v_list from public.tm_list_tasks();
  select public.tm_can_see_task(v_own) into v_own_see;
  select public.tm_can_see_task(v_hid) into v_hid_see;
  select public.tm_is_helper_admin() into v_is_helper;
  select public.tm_is_super_admin() into v_is_super;

  raise notice 'helper_list_count=% helper_sees_own=% helper_sees_other=% helper_is_helper=% helper_is_super=% auth_uid=%',
    v_list, v_own_see, v_hid_see, v_is_helper, v_is_super, auth.uid();

  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', 'anon', true);

  begin
    perform count(*) from public.tm_list_tasks();
    raise exception 'UNEXPECTED: anon listed tasks';
  exception
    when others then
      raise notice 'anon_list_tasks=%', sqlerrm;
  end;

  raise notice 'anon_can_see_task=% anon_is_super=% anon_is_helper=% auth_can_select=% anon_can_select=%',
    public.tm_can_see_task(v_own),
    public.tm_is_super_admin(),
    public.tm_is_helper_admin(),
    has_table_privilege('authenticated', 'public.tm_tasks', 'select'),
    has_table_privilege('anon', 'public.tm_tasks', 'select');
end;
$p$;
