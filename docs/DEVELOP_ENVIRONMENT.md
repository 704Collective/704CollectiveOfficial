# 704 Collective — Develop Branch Environment (Practice Kitchen)

Last updated: 2026-07-16

## What this is
Persistent Supabase branch for safe rehearsal of risky changes (migrations,
Stripe flows, Stage 5 identity work). Production is NEVER touched from here.

## Refs
- PRODUCTION project ref: bnmtynevbuplqpuqvmna  (live members, live money)
- DEVELOP branch ref:     rlypudgmskdonxjtjreb  (persistent: true)

## Access rules
- supabase-704 MCP in Cursor = READ-ONLY, hardwired to PRODUCTION.
- ALL develop writes go via Supabase CLI + dockerized psql, in ONE PowerShell
  invocation (variables do not survive across shells):
    $envOut = supabase branches get develop -o env
    $url = (($envOut | Where-Object { $_ -like 'POSTGRES_URL=*' }) -replace '^POSTGRES_URL=','' -replace '"','')
    if ($url -match 'bnmtynevbuplqpuqvmna') { throw 'ABORT: PRODUCTION ref detected' }
    if ($url -notmatch 'pooler\.supabase\.com') { throw 'ABORT: expected IPv4 pooler URL' }
    docker run --rm -v "${PWD}\supabase\seed:/seed" postgres:17 psql "$url" ...
- Never print connection URLs. Banned vs prod: supabase db push, supabase db reset --linked.

## Schema
Baseline migration 20260712000000 (certified single-page rebuild of prod schema).

## Seed data
File: supabase/seed/develop_seed.sql (rerunnable, wipe-first).
- Safety guard: aborts if >50 profiles exist (prod protection).
- 14 auth accounts, seed-*@704collective.dev, password Test1234!
  Covers: admin, social $49, grandfathered $35, business monthly/annual,
  coupon-comp, override-comp, canceled clean, canceled-drift (Q6 dummy),
  soft-deleted, social/business non-members, partner(vendor), unsubscribed.
- 5 people rows in the 3 Stage-5 bridge states: healthy (metadata.profile_id),
  stale email-match, orphan.
- 3 SEED events (weekly parent+child, one-off) + tickets, credentials,
  public RSVP, payments.
Rerun anytime with the single-invocation pattern above.

## Stripe (TEST universe only)
- Branch secret STRIPE_SECRET_KEY = sk_test key from the account's Test mode
  sandbox (set 2026-07-16). Live keys NEVER go on this branch.
- Test products created in the sandbox (recurring USD):
  - Social Membership  $49/mo   price_1TtgynRzSIH3EgWLX29sKSjP  (prod_UtTwv5D7ObQb81)
  - Social Ambassador  $35/mo   price_1Ttgz7RzSIH3EgWLKFzyJN2D
  - Business Membership $300/mo price_1TtgzMRzSIH3EgWLYMXxFB2N
  - Business Annual  $3600/yr   price_1TtgzsRzSIH3EgWLlRkVNjVh
- Branch secrets set: STRIPE_SOCIAL_PRICE_ID, STRIPE_SOCIAL_PRODUCT_ID,
  STRIPE_AMBASSADOR_SOCIAL_PRICE_ID, STRIPE_BUSINESS_PRICE_ID,
  STRIPE_BUSINESS_ANNUAL_PRICE_ID.
- Test card: 4242 4242 4242 4242, any future expiry, any CVC.

## Not yet configured on develop (deferred, intentional)
- STRIPE_WEBHOOK_SECRET — wire when first rehearsing a webhook flow (needs a
  sandbox webhook endpoint pointed at this branch's functions).
- RESEND_API_KEY — absent on purpose; branch cannot send real email.
- R2 storage, pg_cron jobs, Vault secrets — not replicated; add per-rehearsal
  as needed and document here.
- STRIPE_JOIN_URL — app-layer (Vercel) var, not a branch secret.

## Seed accounts quick reference
All passwords: Test1234!  Domain: @704collective.dev (undeliverable by design)
seed-admin, seed-social-49, seed-social-35, seed-biz-monthly, seed-biz-annual,
seed-coupon-comp, seed-override-comp, seed-canceled, seed-canceled-drift,
seed-deleted, seed-social-nonmember, seed-biz-nonmember, seed-partner,
seed-unsubscribed. Plus people-only: seed-orphan.
