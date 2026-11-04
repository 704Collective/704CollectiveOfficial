-- Develop-only helper upsert. Caller must verify the develop project ref first.
-- Does not print emails.

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  created_at, updated_at
)
select
  '00000000-0000-0000-0000-000000000000',
  'a0000000-0000-4000-8000-000000000015',
  'authenticated',
  'authenticated',
  'seed-helper@704collective.dev',
  extensions.crypt('Test1234!', extensions.gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Seed Helper'),
  '', '', '', '', now(), now()
where not exists (
  select 1 from auth.users
  where id = 'a0000000-0000-4000-8000-000000000015'
     or email = 'seed-helper@704collective.dev'
);

do $d$
declare
  v_id uuid;
begin
  select id into v_id from auth.users where email = 'seed-helper@704collective.dev';
  if v_id is null then
    raise exception 'helper auth user missing';
  end if;

  update auth.users
  set encrypted_password = extensions.crypt('Test1234!', extensions.gen_salt('bf')),
      email_confirmed_at = coalesce(email_confirmed_at, now())
  where id = v_id;

  insert into auth.identities (
    provider_id, user_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at
  )
  select
    v_id::text, v_id,
    jsonb_build_object('sub', v_id::text, 'email', 'seed-helper@704collective.dev'),
    'email', now(), now(), now()
  where not exists (
    select 1 from auth.identities where user_id = v_id and provider = 'email'
  );

  insert into public.profiles (
    id, email, full_name, subscription_status, membership_override,
    member_type, role, account_type, is_internal
  )
  values (
    v_id, 'seed-helper@704collective.dev', 'Seed Helper',
    'inactive', false, 'non_member', 'admin', 'member', true
  )
  on conflict (id) do update set
    email = excluded.email,
    role = 'admin',
    member_type = excluded.member_type,
    is_internal = true,
    deleted_at = null;
end;
$d$;
