-- Door check-in override. Nullable so a normal check-in leaves them empty.
-- Written only when staff types a reason after a failed check.
alter table public.attendance_credentials
  add column if not exists checkin_override_reason text,
  add column if not exists checkin_failed_checks text[];

comment on column public.attendance_credentials.checkin_override_reason is
  'Staff reason when they let someone in after a failed door check.';
comment on column public.attendance_credentials.checkin_failed_checks is
  'Failed door checks that were overridden, e.g. not_a_member, wrong_tier, event_cancelled.';
