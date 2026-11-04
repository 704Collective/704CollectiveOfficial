-- Develop-only Wave 3 points-math asserts. Safe to re-run. Never apply on production.

do $$
declare
  v_parent uuid := 'd0000000-0000-4000-8000-000000000301';
  v_task_child uuid := 'd0000000-0000-4000-8000-000000000302';
  v_num_a uuid := 'd0000000-0000-4000-8000-000000000303';
  v_num_b uuid := 'd0000000-0000-4000-8000-000000000304';
  v_num_c uuid := 'd0000000-0000-4000-8000-000000000305';
  v_shared_goal_a uuid := 'd0000000-0000-4000-8000-000000000306';
  v_shared_goal_b uuid := 'd0000000-0000-4000-8000-000000000307';
  v_shared_parent uuid := 'd0000000-0000-4000-8000-000000000308';
  v_p jsonb;
  v_admin uuid := 'a0000000-0000-4000-8000-000000000001';
  i int;
  v_ids uuid[] := array[
    'e0000000-0000-4000-8000-000000000301',
    'e0000000-0000-4000-8000-000000000302',
    'e0000000-0000-4000-8000-000000000303',
    'e0000000-0000-4000-8000-000000000304',
    'e0000000-0000-4000-8000-000000000305',
    'e0000000-0000-4000-8000-000000000306',
    'e0000000-0000-4000-8000-000000000307'
  ];
begin
  if current_database() ilike '%bnmty%' then
    raise exception 'ABORT: production database';
  end if;

  delete from public.tm_task_goals where task_id = any(v_ids);
  delete from public.tm_task_owners where task_id = any(v_ids);
  delete from public.tm_tasks where id = any(v_ids);
  delete from public.tm_goal_progress_log where goal_id in (v_num_a, v_num_b, v_num_c);
  delete from public.tm_goals where id in (
    v_parent, v_task_child, v_num_a, v_num_b, v_num_c, v_shared_goal_a, v_shared_goal_b, v_shared_parent
  );

  insert into public.tm_goals (id, name, kind, color, status)
  values
    (v_task_child, 'ASSERT 15 of 20', 'task', '#C6A664', 'active'),
    (v_parent, 'ASSERT parent', 'parent', '#6B8E9F', 'active'),
    (v_num_a, 'ASSERT number 40', 'number', '#7A9E7E', 'active'),
    (v_num_b, 'ASSERT number 20', 'number', '#8B7BB8', 'active'),
    (v_num_c, 'ASSERT number 19/20', 'number', '#C47B5A', 'active'),
    (v_shared_parent, 'ASSERT shared parent', 'parent', '#4A9B8C', 'active'),
    (v_shared_goal_a, 'ASSERT shared A', 'task', '#4A9B8C', 'active'),
    (v_shared_goal_b, 'ASSERT shared B', 'task', '#4A9B8C', 'active');

  update public.tm_goals set parent_id = v_parent where id in (v_task_child, v_num_a, v_num_b);
  update public.tm_goals set parent_id = v_shared_parent where id in (v_shared_goal_a, v_shared_goal_b);
  update public.tm_goals
  set number_target = 10, number_source = 'manual', size = 'XL', number_cached_at = null
  where id in (v_num_a, v_num_b);
  update public.tm_goals
  set number_target = 20, number_source = 'manual', size = 'XL', number_cached_at = null
  where id = v_num_c;

  insert into public.tm_goal_progress_log (goal_id, delta) values (v_num_a, 4), (v_num_b, 2), (v_num_c, 19);

  -- 4x L tasks on the 15/20 goal: 3 done + 1 open = 15/20. Extra cancelled L excluded.
  insert into public.tm_tasks (id, title, status, size, counts, created_by)
  values
    ('e0000000-0000-4000-8000-000000000301', 'A1', 'done', 'L', true, v_admin),
    ('e0000000-0000-4000-8000-000000000302', 'A2', 'done', 'L', true, v_admin),
    ('e0000000-0000-4000-8000-000000000303', 'A3', 'done', 'L', true, v_admin),
    ('e0000000-0000-4000-8000-000000000304', 'A4', 'open', 'L', true, v_admin),
    ('e0000000-0000-4000-8000-000000000305', 'A cancel', 'cancelled', 'L', true, v_admin),
    ('e0000000-0000-4000-8000-000000000306', 'Shared M done', 'done', 'M', true, v_admin),
    ('e0000000-0000-4000-8000-000000000307', 'Shared M open', 'open', 'M', true, v_admin);

  insert into public.tm_task_owners (task_id, profile_id)
  select unnest(v_ids), v_admin;

  insert into public.tm_task_goals (task_id, goal_id) values
    ('e0000000-0000-4000-8000-000000000301', v_task_child),
    ('e0000000-0000-4000-8000-000000000302', v_task_child),
    ('e0000000-0000-4000-8000-000000000303', v_task_child),
    ('e0000000-0000-4000-8000-000000000304', v_task_child),
    ('e0000000-0000-4000-8000-000000000305', v_task_child),
    ('e0000000-0000-4000-8000-000000000306', v_shared_goal_a),
    ('e0000000-0000-4000-8000-000000000306', v_shared_goal_b),
    ('e0000000-0000-4000-8000-000000000307', v_shared_goal_a),
    ('e0000000-0000-4000-8000-000000000307', v_shared_goal_b);

  v_p := public.tm_goal_progress(v_task_child);
  if (v_p->>'got')::numeric is distinct from 15 or (v_p->>'total')::numeric is distinct from 20 or (v_p->>'pct')::numeric is distinct from 75 then
    raise exception 'FAIL 15/20=75 got %', v_p;
  end if;

  v_p := public.tm_goal_progress(v_parent);
  if (v_p->>'got')::numeric is distinct from 21 or (v_p->>'total')::numeric is distinct from 40 or (v_p->>'pct')::numeric is distinct from 53 then
    raise exception 'FAIL parent 21/40=53 got %', v_p;
  end if;

  v_p := public.tm_goal_progress(v_num_c);
  if (v_p->>'got')::numeric is distinct from 19 or (v_p->>'total')::numeric is distinct from 20 or (v_p->>'pct')::numeric is distinct from 95 then
    raise exception 'FAIL number 19/20=95 got %', v_p;
  end if;
  if ((v_p->>'pct')::numeric / 100.0) * public.tm_points('XL') is distinct from 9.5 then
    raise exception 'FAIL 95%% of XL points';
  end if;

  -- Cancelled excluded: adding the cancelled L to totals would have been 15/25
  if (public.tm_goal_progress(v_task_child)->>'total')::numeric = 25 then
    raise exception 'FAIL cancelled was counted';
  end if;

  v_p := public.tm_goal_progress(v_shared_parent);
  -- Shared done M (3) + shared open M (3) = 3/6, not 6/12
  if (v_p->>'got')::numeric is distinct from 3 or (v_p->>'total')::numeric is distinct from 6 then
    raise exception 'FAIL shared task counted once got %', v_p;
  end if;

  raise notice 'WAVE3 POINTS ASSERTS PASS';

  delete from public.tm_task_goals where task_id = any(v_ids);
  delete from public.tm_task_owners where task_id = any(v_ids);
  delete from public.tm_tasks where id = any(v_ids);
  delete from public.tm_goal_progress_log where goal_id in (v_num_a, v_num_b, v_num_c);
  delete from public.tm_goals where id in (
    v_parent, v_task_child, v_num_a, v_num_b, v_num_c, v_shared_goal_a, v_shared_goal_b, v_shared_parent
  );
end $$;
