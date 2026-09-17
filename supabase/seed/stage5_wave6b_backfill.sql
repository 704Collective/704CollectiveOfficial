-- ============================================================================
-- IDENTITY WAVE 6B — contacts -> people backfill (the fold, data half)
-- ============================================================================
-- One transaction. Re-runnable: every write is keyed on "not yet done", so a
-- second run is a complete no-op and the receipt shows zeros. Nothing is
-- deleted anywhere. Every write is signed (people.metadata.wave6_fold,
-- people.metadata.source = 'wave6_fold' on mints) so the whole wave reverses.
--
-- Locked decisions (cursor_report_wave6b.md §5, Adam 2026-09-17):
--   * link by email_lower, keyed on contacts.person_id is null
--   * mint the unmatched: roles ['prospect'] for membership-door sources
--     (join_page, giveaway, manual, ambassador_referral:*), ['guest'] otherwise
--   * 'prospect' role merged onto matched people ONLY for membership-door
--     sources, never onto member-role people
--   * contacts.status 'lead' is dropped, not tagged
--   * person's full_name / phone always win; contact variants preserved under
--     metadata.wave6_fold.contact_full_name / contact_phone
--   * the case-twin contact pair both link to the same person; merge is 6E
--   * one opt-out flag: people.marketing_unsubscribed = OR(contacts.unsubscribed,
--     profiles.marketing_unsubscribed)
--
-- Tripwires read LIVE counts and shapes; nothing is hard-coded. Aborts on:
--   pre : any contact email matching >1 people rows, any identity split
--         (email -> person P, but the same email's profile -> person Q != P),
--         duplicate people emails already present
--   post: any contact still unlinked, any link pointing at a person whose
--         email differs, duplicate people emails, auth/metadata mirror
--         mismatch, any change to identity_bridge_health member counters.
--
-- Run as postgres (SQL editor / Management API). Develop first, then prod.
-- ============================================================================

begin;

create temp table w6b_receipt (k text primary key, n bigint not null) on commit drop;

-- membership-door predicate, used in three places
create temp table w6b_door (source_pattern text) on commit drop;
insert into w6b_door values ('join_page'), ('giveaway'), ('manual'), ('ambassador_referral:%');

-- ── 0. PRE-FLIGHT ────────────────────────────────────────────────────────────
do $$
declare
  v_multi   int;
  v_split   int;
  v_dup     int;
  v_total   int;
  v_bridged int;
begin
  -- a contact email that maps to more than one person (impossible under
  -- people_email_lower_unique, asserted anyway)
  select count(*) into v_multi
    from contacts c
   where (select count(*) from people p where p.email_lower = lower(trim(c.email))) > 1;
  if v_multi <> 0 then
    raise exception 'TRIPWIRE pre: % contacts match more than one person', v_multi;
  end if;

  -- identity split: email says person P, but the profile with that email is
  -- bound (auth_user_id) to a different person Q
  select count(*) into v_split
    from contacts c
    join people   p  on p.email_lower = lower(trim(c.email))
    join profiles pr on lower(trim(pr.email)) = lower(trim(c.email))
    join people   q  on q.auth_user_id = pr.id
   where q.id <> p.id;
  if v_split <> 0 then
    raise exception 'TRIPWIRE pre: % contacts whose email resolves to two different people (by email vs by auth); adjudicate first', v_split;
  end if;

  select count(*) into v_dup
    from (select email_lower from people group by 1 having count(*) > 1) d;
  if v_dup <> 0 then
    raise exception 'TRIPWIRE pre: % duplicate people emails already present', v_dup;
  end if;

  -- bridge counters, compared at the end (member identity must not move)
  select member_profiles_total, bridged_ok into v_total, v_bridged from identity_bridge_health;
  insert into w6b_receipt values ('pre_bridge_member_profiles_total', v_total), ('pre_bridge_ok', v_bridged);
  insert into w6b_receipt select 'pre_contacts_total', count(*) from contacts;
  insert into w6b_receipt select 'pre_contacts_unlinked', count(*) from contacts where person_id is null;
end $$;

-- ── 1. LINK the matched (keyed on person_id is null) ─────────────────────────
do $$
declare n bigint;
begin
  update contacts c
     set person_id = p.id
    from people p
   where c.person_id is null
     and p.email_lower = lower(trim(c.email));
  get diagnostics n = row_count;
  insert into w6b_receipt values ('linked_by_email', n);
end $$;

-- ── 2. MINT the unmatched ────────────────────────────────────────────────────
do $$
declare n bigint; m bigint;
begin
  insert into people (email, full_name, phone, roles, sms_consent, sms_consent_at,
                      marketing_unsubscribed, unsubscribed_at, metadata)
  select lower(trim(c.email)),
         nullif(trim(c.full_name), ''),
         nullif(trim(c.phone), ''),
         case when exists (select 1 from w6b_door d where c.source like d.source_pattern)
              then array['prospect'] else array['guest'] end,
         coalesce(c.sms_consent, false),
         case when coalesce(c.sms_consent, false) then c.sms_consent_at end,
         coalesce(c.unsubscribed, false),
         case when coalesce(c.unsubscribed, false) then coalesce(c.unsubscribed_at, now()) end,
         jsonb_build_object(
           'source',         'wave6_fold',
           'contact_id',     c.id::text,
           'contact_source', c.source,
           'minted_at',      now()::text)
         || case when c.metadata <> '{}'::jsonb then jsonb_build_object('guest_pass', c.metadata) else '{}'::jsonb end
    from contacts c
   where c.person_id is null
     and not exists (select 1 from people p where p.email_lower = lower(trim(c.email)));
  get diagnostics n = row_count;
  insert into w6b_receipt values ('minted', n);

  -- link what we just minted (and anything that appeared between the two statements)
  update contacts c
     set person_id = p.id
    from people p
   where c.person_id is null
     and p.email_lower = lower(trim(c.email));
  get diagnostics m = row_count;
  insert into w6b_receipt values ('linked_after_mint', m);
end $$;

-- ── 3. FOLD scalars onto the linked person (each keyed on "needs it") ────────
do $$
declare n bigint;
begin
  -- 3a. phone: fill where the person has none
  update people p
     set phone = nullif(trim(c.phone), ''),
         metadata = coalesce(p.metadata, '{}'::jsonb)
                    || jsonb_build_object('wave6_fold', coalesce(p.metadata->'wave6_fold', '{}'::jsonb) || jsonb_build_object('phone_filled_from_contact', c.id::text))
    from contacts c
   where c.person_id = p.id
     and (p.phone is null or trim(p.phone) = '')
     and c.phone is not null and trim(c.phone) <> ''
     and (p.metadata->'wave6_fold'->>'phone_filled_from_contact') is null;
  get diagnostics n = row_count; insert into w6b_receipt values ('phone_filled', n);

  -- 3b. phone disagreement: person wins, contact variant preserved
  update people p
     set metadata = coalesce(p.metadata, '{}'::jsonb)
                    || jsonb_build_object('wave6_fold', coalesce(p.metadata->'wave6_fold', '{}'::jsonb) || jsonb_build_object('contact_phone', c.phone))
    from contacts c
   where c.person_id = p.id
     and c.phone is not null and p.phone is not null
     and regexp_replace(c.phone, '\D', '', 'g') <> regexp_replace(p.phone, '\D', '', 'g')
     and (p.metadata->'wave6_fold'->>'contact_phone') is distinct from c.phone;
  get diagnostics n = row_count; insert into w6b_receipt values ('phone_variant_preserved', n);

  -- 3c. name: fill where null; otherwise person wins and the variant is preserved
  update people p
     set full_name = trim(c.full_name),
         metadata = coalesce(p.metadata, '{}'::jsonb)
                    || jsonb_build_object('wave6_fold', coalesce(p.metadata->'wave6_fold', '{}'::jsonb) || jsonb_build_object('name_filled_from_contact', c.id::text))
    from contacts c
   where c.person_id = p.id
     and (p.full_name is null or trim(p.full_name) = '')
     and c.full_name is not null and trim(c.full_name) <> ''
     and (p.metadata->'wave6_fold'->>'name_filled_from_contact') is null;
  get diagnostics n = row_count; insert into w6b_receipt values ('name_filled', n);

  update people p
     set metadata = coalesce(p.metadata, '{}'::jsonb)
                    || jsonb_build_object('wave6_fold', coalesce(p.metadata->'wave6_fold', '{}'::jsonb) || jsonb_build_object('contact_full_name', c.full_name))
    from contacts c
   where c.person_id = p.id
     and c.full_name is not null and p.full_name is not null
     and lower(trim(c.full_name)) <> lower(trim(p.full_name))
     and (p.metadata->'wave6_fold'->>'contact_full_name') is distinct from c.full_name;
  get diagnostics n = row_count; insert into w6b_receipt values ('name_variant_preserved', n);

  -- 3d. sms consent: OR; earliest consent timestamp wins
  update people p
     set sms_consent    = true,
         sms_consent_at = least(coalesce(p.sms_consent_at, c.sms_consent_at, now()), coalesce(c.sms_consent_at, p.sms_consent_at, now())),
         metadata = coalesce(p.metadata, '{}'::jsonb)
                    || jsonb_build_object('wave6_fold', coalesce(p.metadata->'wave6_fold', '{}'::jsonb) || jsonb_build_object('sms_consent_from_contact', c.id::text))
    from contacts c
   where c.person_id = p.id
     and c.sms_consent = true
     and coalesce(p.sms_consent, false) = false;
  get diagnostics n = row_count; insert into w6b_receipt values ('sms_consent_folded', n);

  -- 3e. opt-out from contacts (one flag)
  update people p
     set marketing_unsubscribed = true,
         unsubscribed_at = least(coalesce(p.unsubscribed_at, c.unsubscribed_at, now()), coalesce(c.unsubscribed_at, p.unsubscribed_at, now())),
         metadata = coalesce(p.metadata, '{}'::jsonb)
                    || jsonb_build_object('wave6_fold', coalesce(p.metadata->'wave6_fold', '{}'::jsonb) || jsonb_build_object('unsubscribed_from', 'contacts'))
    from contacts c
   where c.person_id = p.id
     and c.unsubscribed = true
     and p.marketing_unsubscribed = false;
  get diagnostics n = row_count; insert into w6b_receipt values ('optout_folded_from_contacts', n);

  -- 3f. opt-out from profiles (same flag, via auth_user_id)
  update people p
     set marketing_unsubscribed = true,
         unsubscribed_at = coalesce(p.unsubscribed_at, now()),
         metadata = coalesce(p.metadata, '{}'::jsonb)
                    || jsonb_build_object('wave6_fold', coalesce(p.metadata->'wave6_fold', '{}'::jsonb) || jsonb_build_object('unsubscribed_from', 'profiles'))
    from profiles pr
   where pr.id = p.auth_user_id
     and pr.marketing_unsubscribed = true
     and p.marketing_unsubscribed = false;
  get diagnostics n = row_count; insert into w6b_receipt values ('optout_folded_from_profiles', n);

  -- 3g. guest-pass metadata (24 invitee rows) preserved verbatim
  update people p
     set metadata = coalesce(p.metadata, '{}'::jsonb) || jsonb_build_object('guest_pass', c.metadata)
    from contacts c
   where c.person_id = p.id
     and c.metadata <> '{}'::jsonb
     and (p.metadata->'guest_pass') is null;
  get diagnostics n = row_count; insert into w6b_receipt values ('guest_pass_metadata_folded', n);

  -- 3h. 'prospect' role, membership-door sources only, never onto members
  update people p
     set roles = array_append(p.roles, 'prospect'),
         metadata = coalesce(p.metadata, '{}'::jsonb)
                    || jsonb_build_object('wave6_fold', coalesce(p.metadata->'wave6_fold', '{}'::jsonb) || jsonb_build_object('role_added', 'prospect'))
   where not ('prospect' = any(p.roles))
     and not ('member'   = any(p.roles))
     and exists (select 1 from contacts c join w6b_door d on c.source like d.source_pattern where c.person_id = p.id);
  get diagnostics n = row_count; insert into w6b_receipt values ('prospect_role_merged', n);

  -- 3i. every linked person carries the fold signature (link provenance)
  update people p
     set metadata = coalesce(p.metadata, '{}'::jsonb)
                    || jsonb_build_object('wave6_fold', coalesce(p.metadata->'wave6_fold', '{}'::jsonb) || jsonb_build_object('linked_at', now()::text))
   where exists (select 1 from contacts c where c.person_id = p.id)
     and (p.metadata->'wave6_fold'->>'linked_at') is null;
  get diagnostics n = row_count; insert into w6b_receipt values ('people_signed', n);
end $$;

-- ── 4. TAGS -> person_tags (verbatim, minus 'lead'; PK collapses twins) ──────
do $$
declare n bigint;
begin
  insert into person_tags (person_id, tag, created_at)
  select c.person_id, t.tag, min(t.created_at)
    from contact_tags t
    join contacts c on c.id = t.contact_id
   where c.person_id is not null
     and t.tag <> 'lead'
   group by c.person_id, t.tag
  on conflict (person_id, tag) do nothing;
  get diagnostics n = row_count;
  insert into w6b_receipt values ('person_tags_inserted', n);
end $$;

-- ── 5. CHILD person_id stamps ────────────────────────────────────────────────
do $$
declare n bigint;
begin
  update contact_activity a set person_id = p.id
    from people p where a.person_id is null and p.auth_user_id = a.profile_id;
  get diagnostics n = row_count; insert into w6b_receipt values ('contact_activity_via_profile', n);

  update contact_activity a set person_id = c.person_id
    from contacts c where a.person_id is null and c.id = a.contact_id and c.person_id is not null;
  get diagnostics n = row_count; insert into w6b_receipt values ('contact_activity_via_contact', n);

  update guest_pass_events g set person_id = c.person_id
    from contacts c where g.person_id is null and c.id = g.contact_id and c.person_id is not null;
  get diagnostics n = row_count; insert into w6b_receipt values ('guest_pass_events_stamped', n);

  update event_public_rsvps r set person_id = c.person_id
    from contacts c where r.person_id is null and c.id = r.contact_id and c.person_id is not null;
  get diagnostics n = row_count; insert into w6b_receipt values ('event_public_rsvps_via_contact', n);

  update event_public_rsvps r set person_id = p.id
    from people p where r.person_id is null and p.email_lower = lower(trim(r.email));
  get diagnostics n = row_count; insert into w6b_receipt values ('event_public_rsvps_via_email', n);

  update exchange_intake i set person_id = c.person_id
    from contacts c where i.person_id is null and c.id = i.contact_id and c.person_id is not null;
  get diagnostics n = row_count; insert into w6b_receipt values ('exchange_intake_via_contact', n);
end $$;

-- ── 6. RECEIPT TRIPWIRES ─────────────────────────────────────────────────────
do $$
declare
  v int; v_total int; v_bridged int; pre_total bigint; pre_bridged bigint;
begin
  select count(*) into v from contacts where person_id is null;
  if v <> 0 then raise exception 'TRIPWIRE post: % contacts still unlinked', v; end if;

  select count(*) into v
    from contacts c join people p on p.id = c.person_id
   where p.email_lower <> lower(trim(c.email));
  if v <> 0 then raise exception 'TRIPWIRE post: % links point at a person with a different email', v; end if;

  select count(*) into v from (select email_lower from people group by 1 having count(*) > 1) d;
  if v <> 0 then raise exception 'TRIPWIRE post: % duplicate people emails', v; end if;

  select count(*) into v from people
   where auth_user_id is not null and (metadata->>'profile_id') is distinct from auth_user_id::text;
  if v <> 0 then raise exception 'TRIPWIRE post: % auth/metadata mirror mismatches', v; end if;

  select count(*) into v from person_tags where tag = 'lead';
  if v <> 0 then raise exception 'TRIPWIRE post: lead leaked into person_tags'; end if;

  select count(*) into v from people p
   where 'member' = any(p.roles) and (p.metadata->'wave6_fold'->>'role_added') is not null;
  if v <> 0 then raise exception 'TRIPWIRE post: prospect role was merged onto % member-role people', v; end if;

  select member_profiles_total, bridged_ok into v_total, v_bridged from identity_bridge_health;
  select n into pre_total   from w6b_receipt where k = 'pre_bridge_member_profiles_total';
  select n into pre_bridged from w6b_receipt where k = 'pre_bridge_ok';
  if v_total <> pre_total or v_bridged <> pre_bridged then
    raise exception 'TRIPWIRE post: identity_bridge_health moved (% / % -> % / %)', pre_total, pre_bridged, v_total, v_bridged;
  end if;

  insert into w6b_receipt select 'post_contacts_linked', count(*) from contacts where person_id is not null;
  insert into w6b_receipt select 'post_person_tags_total', count(*) from person_tags;
  insert into w6b_receipt select 'post_people_unsubscribed', count(*) from people where marketing_unsubscribed;
  insert into w6b_receipt select 'post_people_minted_by_fold', count(*) from people where metadata->>'source' = 'wave6_fold';
  insert into w6b_receipt select 'post_contact_activity_unstamped', count(*) from contact_activity where person_id is null;
  insert into w6b_receipt select 'post_guest_pass_events_unstamped', count(*) from guest_pass_events where person_id is null;
  insert into w6b_receipt select 'post_event_public_rsvps_unstamped', count(*) from event_public_rsvps where person_id is null;
  insert into w6b_receipt values ('post_bridge_member_profiles_total', v_total), ('post_bridge_ok', v_bridged);
end $$;

select k, n from w6b_receipt order by k;

commit;
