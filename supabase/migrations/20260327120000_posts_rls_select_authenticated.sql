-- Allow any authenticated user to read non-deleted posts (feed visibility in UI is still gated by the app).
-- INSERT policy unchanged: active/trialing (or override) members + feed_type rules, or admins.
DROP POLICY IF EXISTS "posts_select" ON posts;
CREATE POLICY "posts_select" ON posts FOR SELECT USING (
  deleted_at IS NULL
  AND auth.uid() IS NOT NULL
);
