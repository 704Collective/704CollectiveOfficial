# 704 Collective — Architecture Principles

This document is the source-of-truth for architectural decisions in the 704 Collective codebase. Cursor reads this as context. Code review enforces it. New code follows it.

## The Core Principle

**A single concept should have a single home.**

When the codebase represents the same logical concept (a person, a recipient, a status, a date format, a config value, a side effect) in multiple places, that is an architectural debt — not a coding choice. The fix is consolidation: one canonical source, one resolver, one function, one config table. New features extend the canonical source. They do not create parallel ones.

## What This Means In Practice

### People

A person is one entity. Members, prospects, sponsors, partners, applicants, and guests are properties of a person — not separate identity tables. The system currently has 8 tables that store info about humans, plus a unified read layer (`_contacts_universe()`). The read layer treats the symptom. The 8-table write side is the disease. New write paths MUST integrate with the unified contacts system — never add a 9th people table.

### Recipients

Event recipients (members + public RSVPs + guest passes) flow through ONE resolver. `get_event_attendees(p_event_id uuid)` returns the unified set. Every consumer — message-attendees, send-follow-ups, post-event drip enrollment, attendee dialogs, count badges — uses this resolver. No new code may write its own ticket-counting or attendee-loading logic.

### Status fields

Status fields use Postgres enums or check constraints — never unconstrained text. New status values are added by migration, not by string-matching in application code. Templates and conditionals map status by structural reference, not by string equality on raw text.

### Date and time formatting

Event dates and times go through `formatEventTime()`, `formatEventDate()`, and `formatEventDateTime()` helpers. Timezone is always America/New_York unless explicitly overridden. New code never calls `date-fns.format()` directly on event-related dates.

### Email sending

Email sends route through the centralized `send-email` edge function, which reads sender configuration from `organization_settings`. New emails extend templates and the centralized config. They do not hardcode sender names, reply-to addresses, or organization info.

### Stripe checkout

All checkout flows call the `create-checkout` edge function. The hardcoded `STRIPE_PAYMENT_LINK` constant has been removed and must not return. New checkout entry points call the existing function.

### Drip campaigns

Drip campaign enrollment flows through `process-drips`. The legacy `guest-followup` function is deprecated; new drips do not use it. When in doubt about which system to integrate with, the answer is `process-drips`.

## What This Means For New Code

Before adding a new table, function, helper, or constant — ask:

1. **Does a canonical version of this already exist?** Search the codebase. If yes, extend it. Do not parallel it.
2. **If I add this, what is the migration story for existing consumers?** New canonical implementations replace old ones via migration, not by living alongside them forever.
3. **What happens when the next developer writes the next consumer?** The canonical path must be the discoverable path. If a new developer would naturally choose the wrong path, the canonical path is failing.

## Anti-Patterns Banned In This Codebase

- **Parallel identity paths** (e.g., `user_id` AND `guest_email` on the same row as identity) — use a unified `person_id`
- **Fan-out writes** (e.g., a new lead capture point writing to `event_entries` but not `contacts`) — write through the unified contacts upsert
- **Inline status string matching** (e.g., `if (status === 'denied' || status === 'rejected')`) — use enums
- **Inline date formatting** (e.g., `format(event.start_at, 'h:mm a')` without timezone) — use the centralized helpers
- **Hardcoded sender info in email functions** (e.g., `from: "hello@..."` baked into a function) — read from `organization_settings`
- **Parallel email systems** (e.g., a new transactional email function that bypasses `send-email`) — extend the existing function
- **Hardcoded payment links** (e.g., a new flow with its own Stripe URL) — use `create-checkout`

## How This Document Gets Enforced

- **Cursor reads this as context** for every prompt. New code is generated against these principles by default.
- **Code review enforces.** PRs that introduce a parallel implementation get flagged and merged only after consolidation.
- **When a new concept emerges that is not covered here**, this document is extended before code ships. The document is the source of truth, not the codebase.

## Living Document

This file evolves. When a new pattern emerges that needs a canonical home, document it here first. When an old pattern is retired, mark it as banned here. The document represents the current best understanding of how this codebase should be structured — not how it was structured at some past point in time.