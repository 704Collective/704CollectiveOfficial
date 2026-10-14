-- Event page: safe public host + attendee count (fix anon 401s)
--
-- Logged-out visitors to /events/[id] hit two PostgREST 401s (SQLSTATE 42501):
--   * rpc/get_event_attendance_count  - anon has no EXECUTE (prod default privileges for
--                                        role postgres only grant EXECUTE to postgres/service_role)
--   * GET profiles?select=full_name   - anon has no table grant on profiles (by design)
--
-- Fix: two narrow SECURITY DEFINER functions that expose ONLY what the public event page
-- renders. No RLS policy is touched and anon gets no table grant on profiles or people.
-- Both functions pin search_path and have EXECUTE granted to anon + authenticated only.

-- ── Host: display name + avatar only ─────────────────────────────────────────
create or replace function public.get_event_host_public(p_event_id uuid)
returns table (display_name text, avatar_url text)
language sql
stable
security definer
set search_path = public
as $$
  select p.full_name::text as display_name,
         p.avatar_url::text as avatar_url
  from public.events e
  join public.profiles p on p.id = e.host_id
  where e.id = p_event_id
    and e.host_id is not null
    and p.deleted_at is null
    -- public pages only see hosts of published events; admins also get them on previews
    and (
      e.is_published = true
      or public.has_role(auth.uid(), 'admin'::app_role)
      or public.has_role(auth.uid(), 'super_admin'::app_role)
    )
  limit 1;
$$;

comment on function public.get_event_host_public(uuid) is
  'Event page: host display name + avatar for a published event. SECURITY DEFINER, returns no other profile fields.';

revoke all on function public.get_event_host_public(uuid) from public;
grant execute on function public.get_event_host_public(uuid) to anon, authenticated;

-- ── Attendee count: integer, published + scheduled events only ────────────────
-- Wraps the same count the list pages already expose publicly (attendance_credentials
-- active|used). Returns NULL for unpublished, cancelled or rescheduled events.
create or replace function public.get_event_public_attendance_count(p_event_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select case
    when exists (
      select 1 from public.events e
      where e.id = p_event_id
        and e.is_published = true
        and e.status = 'scheduled'
    )
    then (
      select count(*)::integer
      from public.attendance_credentials ac
      where ac.event_id = p_event_id
        and ac.status in ('active', 'used')
    )
    else null
  end;
$$;

comment on function public.get_event_public_attendance_count(uuid) is
  'Event page: active+used attendance count for a published, scheduled event; NULL otherwise. SECURITY DEFINER.';

revoke all on function public.get_event_public_attendance_count(uuid) from public;
grant execute on function public.get_event_public_attendance_count(uuid) to anon, authenticated;
