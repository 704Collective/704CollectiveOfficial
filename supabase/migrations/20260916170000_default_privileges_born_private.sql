-- Born-private default privileges for schema public.
--
-- Background (cursor_report_funcexposure.md, cursor_report_authview.md): this
-- project's default ACLs handed anon and authenticated full rights on every
-- new table/view and EXECUTE on every new function created by postgres, so a
-- migration that said only `create function ...` shipped anon-callable. This
-- changes what NEW objects inherit; it does not touch any existing grant.
-- service_role keeps its defaults. From here on, every create function /
-- create view / create table in a migration opts in with an explicit GRANT
-- naming the role it is meant for.
--
-- Applied to PRODUCTION by hand (Adam, Sep 2026). This file records it so the
-- develop branch and any future rebuild carry the same defaults.

alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;

alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;

alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;
