-- ============================================================================
-- IDENTITY WAVE 6C — writer triggers (the fold, at write time)
-- ============================================================================
-- Every writer of contacts / contact_tags / contact_activity now files under
-- the person the moment it writes, with no application code change: the
-- doorway is the table, so the four edge functions, the two opt-out writers,
-- the two crons and the three admin pages are all covered by the same rules.
--
-- Pattern: Wave A companion triggers. SECURITY DEFINER, pinned search_path,
-- every body wrapped so a failure is a WARNING and the parent write always
-- succeeds (capture-prospect sits two steps before checkout).
--
-- Rules are the 6B fold rules, verbatim, so the 6B backfill block stays a
-- complete no-op with these installed:
--   * contacts.email normalised to lower(trim()) on insert/update
--   * person_id null -> link by email_lower, else mint: roles ['prospect'] for
--     membership-door sources (join_page, giveaway, manual, ambassador_referral:*),
--     ['guest'] otherwise; signed metadata {source:'contacts_trigger', ...}
--   * door promotion: on insert with a door source, or when source flips to a
--     door, a non-member person without 'prospect' gains it (never members)
--   * person's full_name / phone win; fill only where null; variants preserved
--     under metadata.wave6_fold.contact_full_name / contact_phone
--   * sms_consent, unsubscribed: OR onto the person, earliest timestamp kept;
--     resubscribe clears the person flag only when no other legacy source
--     still says unsubscribed
--   * guest-pass metadata copied under metadata.guest_pass
--   * contact_tags -> person_tags verbatim minus 'lead'
--   * contact_activity.person_id via profile_id (auth_user_id), then via contact
--   * profiles.marketing_unsubscribed flips mirror onto the linked person
--   * set_marketing_optout(email, flag, source): the canonical future entrypoint
--     for opt-outs — writes the person flag (minting an unknown email as a
--     prospect so the preference is never lost) AND both legacy columns.
--     service_role execute only. The two current opt-out writers stay untouched
--     this wave and are covered by the mirrors.
--
-- Nothing is frozen here; revokes on contacts writes are Wave 6E after 6D has
-- moved the readers.
-- ============================================================================

-- ── helper: membership-door predicate (single definition) ────────────────────
create or replace function public.contact_source_is_door(p_source text)
returns boolean
language sql
immutable
as $$
  select coalesce(p_source, '') in ('join_page', 'giveaway', 'manual')
      or coalesce(p_source, '') like 'ambassador_referral:%';
$$;
revoke all on function public.contact_source_is_door(text) from public, anon, authenticated;
grant execute on function public.contact_source_is_door(text) to service_role;

-- ── a. contacts: link / mint / door rule / scalar mirrors ────────────────────
create or replace function public.contacts_link_person()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email     text;
  v_person    uuid;
  v_door      boolean;
  v_old_door  boolean;
  v_name      text;
  v_phone     text;
  v_flip_sms   boolean;
  v_flip_unsub boolean;
  v_flip_resub boolean;
begin
  -- 1. normalise (outside the guarded block: pure string ops)
  if new.email is not null then
    new.email := lower(trim(new.email));
  end if;
  v_email := new.email;
  if v_email is null or v_email = '' then
    return new;
  end if;

  begin
    v_door     := contact_source_is_door(new.source);
    v_old_door := tg_op = 'UPDATE' and contact_source_is_door(old.source);
    v_name     := nullif(trim(coalesce(new.full_name, '')), '');
    v_phone    := nullif(trim(coalesce(new.phone, '')), '');

    -- re-keyed to a different email: the link must follow the email
    if tg_op = 'UPDATE'
       and new.email is distinct from lower(trim(coalesce(old.email, '')))
       and new.person_id is not distinct from old.person_id then
      new.person_id := null;
    end if;

    -- 2. link or mint
    if new.person_id is null then
      select id into v_person from people where email_lower = v_email;
      if v_person is null then
        begin
          insert into people (email, full_name, phone, roles,
                              sms_consent, sms_consent_at,
                              marketing_unsubscribed, unsubscribed_at, metadata)
          values (
            v_email, v_name, v_phone,
            case when v_door then array['prospect'] else array['guest'] end,
            coalesce(new.sms_consent, false),
            case when coalesce(new.sms_consent, false) then coalesce(new.sms_consent_at, now()) end,
            coalesce(new.unsubscribed, false),
            case when coalesce(new.unsubscribed, false) then coalesce(new.unsubscribed_at, now()) end,
            jsonb_build_object('source', 'contacts_trigger',
                               'contact_source', new.source,
                               'minted_at', now()::text)
            || case when coalesce(new.metadata, '{}'::jsonb) <> '{}'::jsonb
                    then jsonb_build_object('guest_pass', new.metadata) else '{}'::jsonb end
          )
          returning id into v_person;
        exception when unique_violation then
          -- a concurrent writer minted first; theirs wins
          select id into v_person from people where email_lower = v_email;
        end;
      end if;
      new.person_id := v_person;
    end if;

    if new.person_id is null then
      return new;
    end if;

    -- 3. door promotion (insert with a door source, or flip onto a door)
    if v_door and (tg_op = 'INSERT' or not v_old_door) then
      update people p
         set roles    = array_append(p.roles, 'prospect'),
             metadata = coalesce(p.metadata, '{}'::jsonb)
                        || jsonb_build_object('wave6_fold',
                             coalesce(p.metadata->'wave6_fold', '{}'::jsonb)
                             || jsonb_build_object('role_added', 'prospect', 'role_added_by', 'contacts_trigger'))
       where p.id = new.person_id
         and not ('prospect' = any(p.roles))
         and not ('member'   = any(p.roles));
    end if;

    -- 4. person wins on name/phone; fill nulls; preserve variants
    if v_phone is not null then
      update people p
         set phone    = v_phone,
             metadata = coalesce(p.metadata, '{}'::jsonb)
                        || jsonb_build_object('wave6_fold',
                             coalesce(p.metadata->'wave6_fold', '{}'::jsonb)
                             || jsonb_build_object('phone_filled_from_contact', new.id::text))
       where p.id = new.person_id
         and (p.phone is null or trim(p.phone) = '');

      update people p
         set metadata = coalesce(p.metadata, '{}'::jsonb)
                        || jsonb_build_object('wave6_fold',
                             coalesce(p.metadata->'wave6_fold', '{}'::jsonb)
                             || jsonb_build_object('contact_phone', new.phone))
       where p.id = new.person_id
         and p.phone is not null
         and regexp_replace(new.phone, '\D', '', 'g') <> regexp_replace(p.phone, '\D', '', 'g')
         and (p.metadata->'wave6_fold'->>'contact_phone') is distinct from new.phone;
    end if;

    if v_name is not null then
      update people p
         set full_name = v_name,
             metadata  = coalesce(p.metadata, '{}'::jsonb)
                         || jsonb_build_object('wave6_fold',
                              coalesce(p.metadata->'wave6_fold', '{}'::jsonb)
                              || jsonb_build_object('name_filled_from_contact', new.id::text))
       where p.id = new.person_id
         and (p.full_name is null or trim(p.full_name) = '');

      update people p
         set metadata = coalesce(p.metadata, '{}'::jsonb)
                        || jsonb_build_object('wave6_fold',
                             coalesce(p.metadata->'wave6_fold', '{}'::jsonb)
                             || jsonb_build_object('contact_full_name', new.full_name))
       where p.id = new.person_id
         and p.full_name is not null
         and lower(trim(new.full_name)) <> lower(trim(p.full_name))
         and (p.metadata->'wave6_fold'->>'contact_full_name') is distinct from new.full_name;
    end if;

    -- 5. sms consent: OR, earliest timestamp
    v_flip_sms := coalesce(new.sms_consent, false)
                  and (tg_op = 'INSERT' or not coalesce(old.sms_consent, false)
                       or exists (select 1 from people p where p.id = new.person_id and coalesce(p.sms_consent, false) = false));
    if v_flip_sms then
      update people p
         set sms_consent    = true,
             sms_consent_at = least(coalesce(p.sms_consent_at, new.sms_consent_at, now()),
                                    coalesce(new.sms_consent_at, p.sms_consent_at, now())),
             metadata = coalesce(p.metadata, '{}'::jsonb)
                        || jsonb_build_object('wave6_fold',
                             coalesce(p.metadata->'wave6_fold', '{}'::jsonb)
                             || jsonb_build_object('sms_consent_from_contact', new.id::text))
       where p.id = new.person_id
         and coalesce(p.sms_consent, false) = false;
    end if;

    -- 6. opt-out: OR onto the one flag, earliest timestamp; resubscribe clears
    --    only when profiles does not still say unsubscribed
    v_flip_unsub := coalesce(new.unsubscribed, false)
                    and (tg_op = 'INSERT' or not coalesce(old.unsubscribed, false)
                         or exists (select 1 from people p where p.id = new.person_id and p.marketing_unsubscribed = false));
    v_flip_resub := tg_op = 'UPDATE' and not coalesce(new.unsubscribed, false) and coalesce(old.unsubscribed, false);

    if v_flip_unsub then
      update people p
         set marketing_unsubscribed = true,
             unsubscribed_at = least(coalesce(p.unsubscribed_at, new.unsubscribed_at, now()),
                                     coalesce(new.unsubscribed_at, p.unsubscribed_at, now())),
             metadata = coalesce(p.metadata, '{}'::jsonb)
                        || jsonb_build_object('wave6_fold',
                             coalesce(p.metadata->'wave6_fold', '{}'::jsonb)
                             || jsonb_build_object('unsubscribed_from', 'contacts'))
       where p.id = new.person_id
         and p.marketing_unsubscribed = false;
    elsif v_flip_resub then
      update people p
         set marketing_unsubscribed = false,
             unsubscribed_at = null
       where p.id = new.person_id
         and p.marketing_unsubscribed = true
         and not exists (select 1 from profiles pr where pr.id = p.auth_user_id and pr.marketing_unsubscribed = true);
    end if;

    -- 7. guest-pass metadata, verbatim, once
    if coalesce(new.metadata, '{}'::jsonb) <> '{}'::jsonb then
      update people p
         set metadata = coalesce(p.metadata, '{}'::jsonb) || jsonb_build_object('guest_pass', new.metadata)
       where p.id = new.person_id
         and (p.metadata->'guest_pass') is null;
    end if;

    -- 8. link signature (same key the 6B backfill writes)
    update people p
       set metadata = coalesce(p.metadata, '{}'::jsonb)
                      || jsonb_build_object('wave6_fold',
                           coalesce(p.metadata->'wave6_fold', '{}'::jsonb)
                           || jsonb_build_object('linked_at', now()::text, 'linked_by', 'contacts_trigger'))
     where p.id = new.person_id
       and (p.metadata->'wave6_fold'->>'linked_at') is null;

  exception when others then
    raise warning '[contacts_link_person] % % (email=%)', sqlstate, sqlerrm, v_email;
  end;

  return new;
end;
$$;

revoke all on function public.contacts_link_person() from public, anon, authenticated;

drop trigger if exists trg_contacts_link_person on public.contacts;
create trigger trg_contacts_link_person
  before insert or update on public.contacts
  for each row execute function public.contacts_link_person();

comment on function public.contacts_link_person() is
  'Wave 6C: every contacts write links (by email_lower) or mints its person, applies the door rule, and mirrors sms/opt-out/phone/name/tags rules from the 6B fold. Never fails the parent write.';

-- ── b. contact_tags -> person_tags ───────────────────────────────────────────
create or replace function public.contact_tags_mirror_person()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.tag is null or new.tag = 'lead' then
    return new;
  end if;
  begin
    insert into person_tags (person_id, tag, created_at)
    select c.person_id, new.tag, coalesce(new.created_at, now())
      from contacts c
     where c.id = new.contact_id
       and c.person_id is not null
    on conflict (person_id, tag) do nothing;
  exception when others then
    raise warning '[contact_tags_mirror_person] % % (contact_id=%)', sqlstate, sqlerrm, new.contact_id;
  end;
  return new;
end;
$$;

revoke all on function public.contact_tags_mirror_person() from public, anon, authenticated;

drop trigger if exists trg_contact_tags_mirror_person on public.contact_tags;
create trigger trg_contact_tags_mirror_person
  after insert on public.contact_tags
  for each row execute function public.contact_tags_mirror_person();

-- ── c. contact_activity: stamp person_id ─────────────────────────────────────
create or replace function public.contact_activity_stamp_person()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    if new.person_id is null and new.profile_id is not null then
      select id into new.person_id from people where auth_user_id = new.profile_id;
    end if;
    if new.person_id is null and new.contact_id is not null then
      select person_id into new.person_id from contacts where id = new.contact_id;
    end if;
  exception when others then
    raise warning '[contact_activity_stamp_person] % %', sqlstate, sqlerrm;
  end;
  return new;
end;
$$;

revoke all on function public.contact_activity_stamp_person() from public, anon, authenticated;

drop trigger if exists trg_contact_activity_stamp_person on public.contact_activity;
create trigger trg_contact_activity_stamp_person
  before insert on public.contact_activity
  for each row execute function public.contact_activity_stamp_person();

-- ── d. profiles.marketing_unsubscribed -> person ─────────────────────────────
create or replace function public.profiles_optout_mirror_person()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    if coalesce(new.marketing_unsubscribed, false) and not coalesce(old.marketing_unsubscribed, false) then
      update people p
         set marketing_unsubscribed = true,
             unsubscribed_at = coalesce(p.unsubscribed_at, now())
       where p.auth_user_id = new.id
         and p.marketing_unsubscribed = false;
    elsif not coalesce(new.marketing_unsubscribed, false) and coalesce(old.marketing_unsubscribed, false) then
      -- resubscribe: clear only when no linked contact still says unsubscribed
      update people p
         set marketing_unsubscribed = false,
             unsubscribed_at = null
       where p.auth_user_id = new.id
         and p.marketing_unsubscribed = true
         and not exists (select 1 from contacts c where c.person_id = p.id and c.unsubscribed = true);
    end if;
  exception when others then
    raise warning '[profiles_optout_mirror_person] % % (profile=%)', sqlstate, sqlerrm, new.id;
  end;
  return new;
end;
$$;

revoke all on function public.profiles_optout_mirror_person() from public, anon, authenticated;

drop trigger if exists trg_profiles_optout_mirror_person on public.profiles;
create trigger trg_profiles_optout_mirror_person
  after update of marketing_unsubscribed on public.profiles
  for each row execute function public.profiles_optout_mirror_person();

-- ── e. set_marketing_optout: the canonical opt-out entrypoint ────────────────
create or replace function public.set_marketing_optout(p_email text, p_unsubscribe boolean, p_source text default 'set_marketing_optout')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email  text := lower(trim(coalesce(p_email, '')));
  v_person uuid;
  v_minted boolean := false;
begin
  if v_email = '' or v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
    return jsonb_build_object('ok', false, 'error', 'invalid email');
  end if;

  select id into v_person from people where email_lower = v_email;

  if v_person is null then
    if p_unsubscribe then
      -- an opt-out is a real person we must remember
      begin
        insert into people (email, full_name, roles, marketing_unsubscribed, unsubscribed_at, metadata)
        values (v_email, split_part(v_email, '@', 1), array['prospect'], true, now(),
                jsonb_build_object('source', 'set_marketing_optout', 'optout_source', p_source, 'minted_at', now()::text))
        returning id into v_person;
        v_minted := true;
      exception when unique_violation then
        select id into v_person from people where email_lower = v_email;
      end;
    end if;
  end if;

  if v_person is not null then
    update people p
       set marketing_unsubscribed = p_unsubscribe,
           unsubscribed_at = case when p_unsubscribe then coalesce(p.unsubscribed_at, now()) else null end,
           metadata = coalesce(p.metadata, '{}'::jsonb)
                      || jsonb_build_object('optout_source', p_source, 'optout_at', now()::text)
     where p.id = v_person
       and (p.marketing_unsubscribed is distinct from p_unsubscribe or v_minted);
  end if;

  -- legacy columns, until 6D moves the readers
  update profiles set marketing_unsubscribed = p_unsubscribe
   where lower(trim(email)) = v_email
     and coalesce(marketing_unsubscribed, false) is distinct from p_unsubscribe;

  update contacts
     set unsubscribed = p_unsubscribe,
         unsubscribed_at = case when p_unsubscribe then coalesce(unsubscribed_at, now()) else null end
   where lower(trim(email)) = v_email
     and coalesce(unsubscribed, false) is distinct from p_unsubscribe;

  return jsonb_build_object('ok', true, 'person_id', v_person, 'minted', v_minted,
                            'action', case when p_unsubscribe then 'unsubscribed' else 'resubscribed' end);
end;
$$;

revoke all on function public.set_marketing_optout(text, boolean, text) from public, anon, authenticated;
grant execute on function public.set_marketing_optout(text, boolean, text) to service_role;

comment on function public.set_marketing_optout(text, boolean, text) is
  'Wave 6C: canonical opt-out writer. Sets people.marketing_unsubscribed (minting an unknown email as a prospect), then the legacy profiles/contacts columns. service_role only.';
