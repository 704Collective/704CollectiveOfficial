# 704 Collective - Architecture

## One concept, one home

A single logical concept has a single home in the codebase. When the same concept - a person, a recipient, a status, a date format, a config value, a side effect - is represented in multiple places, that is architectural debt, not a coding choice. The fix is consolidation: one canonical source, one resolver, one function, one config table. New features extend the canonical source. They do not create parallel ones.

### Concretely, for this codebase

- A person is one row in the `people` table, with role tags. Members, guests, applicants, sponsors, partners are roles - not separate tables.
- An attendance credential is one row in `attendance_credentials`, with type tags. Member passes, member RSVPs, guest passes, public RSVP passes are types - not separate tables.
- A recipient is resolved through one function - `getEventRecipients(event_id)` - that returns every confirmed credential for an event regardless of type.
- A QR code is the credential's token. Same token across wallet, dashboard fallback, email backup. Same scanner reads it.
- An event's eligibility is checked through one helper - `canAttendEvent(person, event)` - comparing `people.member_tier` to `events.required_tier`. Used by the website browse page AND the door scanner. They cannot disagree.
- A date is formatted through one helper - `formatEventTime(date, timezone)` - never `date-fns` `format()` directly on event dates.
- A status is an enum or check-constrained string. Never a plain text field string-matched in templates.
- A price is stored in cents as an integer. Never a decimal. The display layer converts.

## Auth-pattern decision rule

Every edge function uses exactly one auth pattern, determined by WHO calls the function, not what it does. Every edge function declares its auth pattern in a top-of-file comment.

- Cron-invoked function -> service-role / shared-secret check. The `supabase.auth.getUser()` pattern rejects service-role tokens and will break the cron.
- Webhook-invoked (Stripe, Twilio) -> signature verification using the platform's webhook secret. Never JWT.
- Browser admin call -> user JWT + admin role check. For destructive or money-related actions, require super_admin.
- Browser member call -> user JWT + RLS handles the rest. No role check.
- Edge-to-edge internal call -> service-role authentication (SUPABASE_SERVICE_ROLE_KEY).

## super_admin vs admin

- super_admin - card-charging operations, destructive operations (delete, drop), role management, billing changes.
- admin or super_admin - read-heavy admin operations, communication, content publishing.
- When in doubt, default to super_admin. Tightening is harder than loosening after launch.

## Stripe webhook ordering

Any handler added to the stripe-webhook function must run the handler logic BEFORE the processed-event marker is committed, OR use the catch-deletes-marker pattern. Putting the marker insert before the handler reintroduces a bug where a failed handler is never retried (a paid member is silently never activated).

## Enforcement

- Code review rejects any new write path that creates a parallel identity, credential, or recipient surface.
- Code review rejects any new code that calls date-fns format() directly on event-related dates.
- Code review rejects any new edge function that doesn't declare its auth pattern in a top-of-file comment.
- When in doubt, ask: "Is this concept already represented somewhere?" If yes, extend it. Do not create a sibling.
