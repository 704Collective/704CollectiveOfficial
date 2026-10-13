-- Event cancel + reschedule (additive only).
--
-- events.status: 'scheduled' (default) | 'cancelled' | 'rescheduled'.
-- A cancelled/rescheduled event is never deleted; its credentials are voided,
-- its waitlist cleared, and every reader/write-door treats it as closed.
-- rescheduled_to_event_id links the old occurrence to the new live event.
--
-- tickets.status already allows 'cancelled' (tickets_status_check) and
-- event_public_rsvps.status has no CHECK constraint, so neither needs widening.

alter table public.events
  add column if not exists status text not null default 'scheduled',
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid,
  add column if not exists cancel_reason text,
  add column if not exists cancel_note text,
  add column if not exists rescheduled_to_event_id uuid references public.events(id) on delete set null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'events_status_check') then
    alter table public.events
      add constraint events_status_check check (status in ('scheduled', 'cancelled', 'rescheduled'));
  end if;
end $$;

create index if not exists events_status_idx on public.events (status) where status <> 'scheduled';

comment on column public.events.status is 'scheduled | cancelled | rescheduled. Never delete a cancelled/rescheduled event.';
comment on column public.events.rescheduled_to_event_id is 'For status=rescheduled: the new live event everyone must re-RSVP to.';
