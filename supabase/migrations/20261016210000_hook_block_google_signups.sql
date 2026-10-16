-- Before User Created auth hook: Google OAuth can sign IN, never CREATE.
--
-- Supabase auto-links a Google login to an existing account when the verified
-- Google email already belongs to a user, so existing members keep signing in
-- unchanged. When the Google email is unknown GoTrue would mint a brand-new user
-- (and the signup trigger a social_non_member profile) - that is the stray
-- "second account" problem (Andrea / Kiyana / Lance). This hook refuses that
-- creation before any row exists.
--
-- Scope: GoTrue invokes this hook for self-serve creations only (OAuth, /signup,
-- OTP). Admin API creations (auth.admin.createUser - Stripe webhook, comp
-- invites, imports, reconcile, admin invite) do NOT invoke it, and email /
-- password signups pass through because their provider is 'email'.
--
-- Enabling is a project auth setting (not SQL):
--   Dashboard -> Authentication -> Hooks -> "Before User Created" -> Postgres
--   function public.hook_before_user_created, or Management API
--   PATCH /v1/projects/<ref>/config/auth
--     { hook_before_user_created_enabled: true,
--       hook_before_user_created_uri: "pg-functions://postgres/public/hook_before_user_created" }

create or replace function public.hook_before_user_created(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_provider text;
begin
  v_provider := event->'user'->'app_metadata'->>'provider';

  if v_provider = 'google' then
    return jsonb_build_object(
      'error', jsonb_build_object(
        'message', 'No 704 account uses this Google email. Sign in with the email you joined with, or join at 704collective.com/join.',
        'http_code', 403
      )
    );
  end if;

  -- Every other creation path is allowed; {} means "continue".
  return '{}'::jsonb;
end;
$$;

comment on function public.hook_before_user_created(jsonb) is
  'Supabase Before User Created auth hook: refuses new-account creation via Google OAuth (sign-in for existing accounts is unaffected). Allows every other path.';

-- Only the auth server may call it.
revoke all on function public.hook_before_user_created(jsonb) from public;
revoke all on function public.hook_before_user_created(jsonb) from anon;
revoke all on function public.hook_before_user_created(jsonb) from authenticated;
revoke all on function public.hook_before_user_created(jsonb) from service_role; -- default privileges would grant it
grant usage on schema public to supabase_auth_admin;
grant execute on function public.hook_before_user_created(jsonb) to supabase_auth_admin;
