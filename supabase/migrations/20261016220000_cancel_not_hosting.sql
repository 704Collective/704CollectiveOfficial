-- '704 not hosting' cancel option.
-- cancel_mode='standard' (default) is today's hide-everywhere cancel.
-- cancel_mode='not_hosting' keeps the event on member surfaces and keeps
-- the discussion open for people whose RSVP was voided BY this cancel,
-- until events.end_time. After that it behaves like a standard cancel.
--
-- void_reason on attendance_credentials distinguishes "voided by event
-- cancel" from a member un-RSVP (those stay null).

alter table public.events
  add column if not exists cancel_mode text not null default 'standard';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'events_cancel_mode_check') then
    alter table public.events
      add constraint events_cancel_mode_check check (cancel_mode in ('standard', 'not_hosting'));
  end if;
end $$;

comment on column public.events.cancel_mode is
  'standard = hide after cancel (default). not_hosting = keep visible + discussion open until end_time.';

alter table public.attendance_credentials
  add column if not exists void_reason text;

comment on column public.attendance_credentials.void_reason is
  'Set to event_cancel when cancel-event voids the row. Null for member un-RSVP and other voids.';

create index if not exists attendance_credentials_void_reason_idx
  on public.attendance_credentials (event_id, void_reason)
  where void_reason is not null;

-- ── discussion access ────────────────────────────────────────────────────────
-- Keep today's admin + live-RSVP member rule. Add: not_hosting window +
-- credential voided by the cancel + still an active member.

create or replace function public.can_view_event_discussion(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (
    select 1
    from profiles pr
    where pr.id = auth.uid()
      and pr.deleted_at is null
      and (
        pr.role in ('admin', 'super_admin')
        or (
          pr.member_type in ('social', 'business')
          and (
            pr.subscription_status in ('active', 'paused')
            or (pr.subscription_status = 'canceled' and pr.subscription_ends_at > now())
            or pr.membership_override = true
          )
          and exists (
            select 1
            from attendance_credentials ac
            join people pe on pe.id = ac.person_id
            join events e on e.id = ac.event_id
            where ac.event_id = p_event_id
              and ac.credential_type in ('member', 'member_rsvp')
              and pe.metadata->>'profile_id' = pr.id::text
              and (
                ac.status in ('active', 'used')
                or (
                  ac.status = 'voided'
                  and ac.void_reason = 'event_cancel'
                  and e.cancel_mode = 'not_hosting'
                  and e.end_time > now()
                )
              )
          )
        )
      )
  );
$function$;

-- Mention picker: same held-RSVP rule (live, or voided-by-cancel during not_hosting).
create or replace function public.search_event_discussion_mentionables(p_event_id uuid, p_query text)
returns table(id uuid, full_name text, avatar_url text)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select pr.id, pr.full_name, pr.avatar_url
  from profiles pr
  where public.can_view_event_discussion(p_event_id)
    and pr.deleted_at is null
    and pr.is_internal = false
    and pr.full_name is not null
    and pr.full_name ilike '%' || coalesce(p_query, '') || '%'
    and (
      pr.role in ('admin', 'super_admin')
      or (
        pr.member_type in ('social', 'business')
        and (
          pr.subscription_status in ('active', 'paused')
          or (pr.subscription_status = 'canceled' and pr.subscription_ends_at > now())
          or pr.membership_override = true
        )
      )
    )
    and exists (
      select 1
      from attendance_credentials ac
      join people pe on pe.id = ac.person_id
      join events e on e.id = ac.event_id
      where ac.event_id = p_event_id
        and ac.credential_type in ('member', 'member_rsvp')
        and pe.auth_user_id = pr.id
        and (
          ac.status in ('active', 'used')
          or (
            ac.status = 'voided'
            and ac.void_reason = 'event_cancel'
            and e.cancel_mode = 'not_hosting'
            and e.end_time > now()
          )
        )
    )
  order by pr.full_name
  limit 6;
$function$;

-- Bell/mention targets: only people allowed in the discussion.
create or replace function public.get_event_discussion_mentionable_ids(p_event_id uuid)
returns table(id uuid, full_name text)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select pr.id, pr.full_name
  from profiles pr
  where pr.deleted_at is null
    and pr.is_internal = false
    and pr.full_name is not null
    and (
      pr.role in ('admin', 'super_admin')
      or (
        pr.member_type in ('social', 'business')
        and (
          pr.subscription_status in ('active', 'paused')
          or (pr.subscription_status = 'canceled' and pr.subscription_ends_at > now())
          or pr.membership_override = true
        )
      )
    )
    and exists (
      select 1
      from attendance_credentials ac
      join people pe on pe.id = ac.person_id
      join events e on e.id = ac.event_id
      where ac.event_id = p_event_id
        and ac.credential_type in ('member', 'member_rsvp')
        and pe.auth_user_id = pr.id
        and (
          ac.status in ('active', 'used')
          or (
            ac.status = 'voided'
            and ac.void_reason = 'event_cancel'
            and e.cancel_mode = 'not_hosting'
            and e.end_time > now()
          )
        )
    );
$function$;

-- My Events: live RSVPs, plus not_hosting voids until the event ends.
create or replace function public.get_my_events()
returns setof jsonb
language sql
security definer
set search_path to 'public'
as $function$
  select jsonb_build_object(
    'id', ac.id, 'event_id', ac.event_id, 'status', 'confirmed', 'checked_in_at', ac.checked_in_at,
    'events', jsonb_build_object(
      'id', e.id, 'title', e.title, 'start_time', e.start_time,
      'end_time', e.end_time, 'location_name', e.location_name, 'image_url', e.image_url,
      'status', e.status, 'cancel_mode', e.cancel_mode
    )
  )
  from attendance_credentials ac
  join events e on e.id = ac.event_id
  join people pe on pe.id = ac.person_id
  join profiles p on lower(p.email) = pe.email_lower
  where p.id = auth.uid()
    and ac.credential_type in ('member', 'member_rsvp')
    and (
      ac.status in ('active', 'used')
      or (
        ac.status = 'voided'
        and ac.void_reason = 'event_cancel'
        and e.status = 'cancelled'
        and e.cancel_mode = 'not_hosting'
        and e.end_time > now()
      )
    )
  order by e.start_time asc;
$function$;
