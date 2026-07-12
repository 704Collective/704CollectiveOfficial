-- Pre-Sweep Fix 5: remove WITH CHECK (true) RLS policies
--
-- Two policies named "Service role ..." were defined with WITH CHECK (true)
-- and roles {public}. The service role bypasses RLS entirely and never needs
-- a policy, so WITH CHECK (true) on a public-role policy actually granted
-- INSERT/write access to anon and authenticated callers.
--
-- Fix: drop both policies. Dropping alone is sufficient:
--  - contact_tags retains its admin policies (admin_all_contact_tags,
--    "Admins can manage contact tags") and anon_deny_contact_tags, so
--    admins can still write and anon is explicitly denied.
--  - guest_pass_events is left with no INSERT policy at all; Postgres RLS
--    denies any action not permitted by a policy, so non-service-role
--    INSERTs are blocked. The service role still writes (it bypasses RLS),
--    which is how create-guest-pass continues to function.

DROP POLICY IF EXISTS "Service role can manage contact tags" ON public.contact_tags;

DROP POLICY IF EXISTS "Service role can insert guest pass events" ON public.guest_pass_events;
