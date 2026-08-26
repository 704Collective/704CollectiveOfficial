-- Capture-only. Widened Aug 25 by hand on both envs: social members may choose social_only on the public form.
--
-- The CHECK body below is byte-faithful to prod's pg_get_constraintdef output:
--   md5 3f3f243ef4b30954ba6cfe65c1030902, length 180
-- Idempotent by construction.


-- ============================================================
-- exchange_intake_social_only_scope v2
-- v1 allowed social_only only on the commonwealth variant. The third arm is
-- the widening: a social member may also take social_only on the public form.
-- ============================================================

alter table public.exchange_intake
  drop constraint if exists exchange_intake_social_only_scope;

alter table public.exchange_intake
  add constraint exchange_intake_social_only_scope
  CHECK (((participation <> 'social_only'::text) OR (form_variant = 'commonwealth'::text) OR ((form_variant = 'public'::text) AND (member_status_at_submit = 'social_member'::text))));
