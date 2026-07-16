-- =====================================================================
-- 704 COLLECTIVE - DEVELOP BRANCH SEED  (rerunnable; wipe-first)
-- TARGET: develop branch ONLY. Refuses to run against production.
-- =====================================================================
begin;

-- SAFETY GUARD: production has ~214+ profiles; develop has ~0-20.
do $g$ begin
  if (select count(*) from public.profiles) > 50 then
    raise exception 'SAFETY ABORT: >50 profiles found - this looks like PRODUCTION. Seed refuses to run.';
  end if;
end $g$;

-- ---------- WIPE PRIOR SEED (FK-safe order) ----------
delete from public.payments where user_id in (select id from public.profiles where email like 'seed-%@704collective.dev');
delete from public.attendance_credentials where person_id in (select id from public.people where email like 'seed-%@704collective.dev');
delete from public.tickets where event_id in (select id from public.events where title like 'SEED %');
delete from public.event_public_rsvps where event_id in (select id from public.events where title like 'SEED %');
delete from public.events where title like 'SEED %';
delete from public.people where email like 'seed-%@704collective.dev';
delete from public.contacts where email like 'seed-%@704collective.dev';
delete from public.profiles where email like 'seed-%@704collective.dev';
delete from auth.identities where user_id in (select id from auth.users where email like 'seed-%@704collective.dev');
delete from auth.users where email like 'seed-%@704collective.dev';

-- ---------- AUTH USERS (password Test1234!) ----------
insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', v.id, 'authenticated', 'authenticated',
  v.email, extensions.crypt('Test1234!', extensions.gen_salt('bf')),
  now(), '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', v.fn),
  '', '', '', '', now(), now()
from (values
  ('a0000000-0000-4000-8000-000000000001'::uuid,'seed-admin@704collective.dev','Seed Admin'),
  ('a0000000-0000-4000-8000-000000000002'::uuid,'seed-social-49@704collective.dev','Seed Social FullPrice'),
  ('a0000000-0000-4000-8000-000000000003'::uuid,'seed-social-35@704collective.dev','Seed Social Grandfathered'),
  ('a0000000-0000-4000-8000-000000000004'::uuid,'seed-biz-monthly@704collective.dev','Seed Business Monthly'),
  ('a0000000-0000-4000-8000-000000000005'::uuid,'seed-biz-annual@704collective.dev','Seed Business Annual'),
  ('a0000000-0000-4000-8000-000000000006'::uuid,'seed-coupon-comp@704collective.dev','Seed Coupon Comp'),
  ('a0000000-0000-4000-8000-000000000007'::uuid,'seed-override-comp@704collective.dev','Seed Override Comp'),
  ('a0000000-0000-4000-8000-000000000008'::uuid,'seed-canceled@704collective.dev','Seed Canceled Clean'),
  ('a0000000-0000-4000-8000-000000000009'::uuid,'seed-canceled-drift@704collective.dev','Seed Canceled Drift'),
  ('a0000000-0000-4000-8000-000000000010'::uuid,'seed-deleted@704collective.dev','Seed Soft Deleted'),
  ('a0000000-0000-4000-8000-000000000011'::uuid,'seed-social-nonmember@704collective.dev','Seed Social NonMember'),
  ('a0000000-0000-4000-8000-000000000012'::uuid,'seed-biz-nonmember@704collective.dev','Seed Business Applicant'),
  ('a0000000-0000-4000-8000-000000000013'::uuid,'seed-partner@704collective.dev','Seed Partner Vendor'),
  ('a0000000-0000-4000-8000-000000000014'::uuid,'seed-unsubscribed@704collective.dev','Seed Unsubscribed')
) as v(id,email,fn);

insert into auth.identities (provider_id, user_id, identity_data, provider,
  last_sign_in_at, created_at, updated_at)
select u.id::text, u.id,
  jsonb_build_object('sub', u.id::text, 'email', u.email),
  'email', now(), now(), now()
from auth.users u where u.email like 'seed-%@704collective.dev';

-- ---------- PROFILES (upsert: a signup trigger may have pre-created rows) ----------
insert into public.profiles (id, email, full_name, stripe_customer_id, subscription_status,
  subscription_id, member_since, first_payment_at, membership_override, member_type, role,
  account_type, is_partner, partner_type, application_status, deleted_at, canceled_at,
  subscription_ends_at, marketing_unsubscribed, is_locked_in_pricing, is_internal)
values
 ('a0000000-0000-4000-8000-000000000001','seed-admin@704collective.dev','Seed Admin',null,'active',null,now()-interval '400 days',null,true,'social','super_admin','member',false,null,null,null,null,null,false,false,true),
 ('a0000000-0000-4000-8000-000000000002','seed-social-49@704collective.dev','Seed Social FullPrice','cus_SEED002','active','sub_SEED002',now()-interval '90 days',now()-interval '90 days',false,'social','lead','member',false,null,null,null,null,null,false,false,false),
 ('a0000000-0000-4000-8000-000000000003','seed-social-35@704collective.dev','Seed Social Grandfathered','cus_SEED003','active','sub_SEED003',now()-interval '300 days',now()-interval '300 days',false,'social','lead','member',false,null,null,null,null,null,false,true,false),
 ('a0000000-0000-4000-8000-000000000004','seed-biz-monthly@704collective.dev','Seed Business Monthly','cus_SEED004','active','sub_SEED004',now()-interval '120 days',now()-interval '120 days',false,'business','lead','member',false,null,'accepted',null,null,null,false,false,false),
 ('a0000000-0000-4000-8000-000000000005','seed-biz-annual@704collective.dev','Seed Business Annual','cus_SEED005','active','sub_SEED005',now()-interval '200 days',now()-interval '200 days',false,'business','lead','member',false,null,'accepted',null,null,null,false,false,false),
 ('a0000000-0000-4000-8000-000000000006','seed-coupon-comp@704collective.dev','Seed Coupon Comp','cus_SEED006','active','sub_SEED006',now()-interval '60 days',null,false,'social','lead','member',false,null,null,null,null,null,false,false,false),
 ('a0000000-0000-4000-8000-000000000007','seed-override-comp@704collective.dev','Seed Override Comp',null,'active',null,now()-interval '250 days',null,true,'social','lead','member',false,null,null,null,null,null,false,false,false),
 ('a0000000-0000-4000-8000-000000000008','seed-canceled@704collective.dev','Seed Canceled Clean','cus_SEED008',  'canceled',null,now()-interval '180 days',now()-interval '180 days',false,'social','lead','member',false,null,null,null,now()-interval '40 days',now()-interval '10 days',false,false,false),
 ('a0000000-0000-4000-8000-000000000009','seed-canceled-drift@704collective.dev','Seed Canceled Drift','cus_SEED009','canceled','sub_SEED009',now()-interval '150 days',now()-interval '150 days',false,'social','lead','member',false,null,null,null,now()-interval '30 days',now()+interval '5 days',false,false,false),
 ('a0000000-0000-4000-8000-000000000010','seed-deleted@704collective.dev','Seed Soft Deleted','cus_SEED010','inactive',null,now()-interval '220 days',now()-interval '220 days',false,'social','lead','member',false,null,null,now()-interval '20 days',null,null,false,false,false),
 ('a0000000-0000-4000-8000-000000000011','seed-social-nonmember@704collective.dev','Seed Social NonMember',null,'inactive',null,null,null,false,'social_non_member','lead','member',false,null,null,null,null,null,false,false,false),
 ('a0000000-0000-4000-8000-000000000012','seed-biz-nonmember@704collective.dev','Seed Business Applicant',null,'inactive',null,null,null,false,'business_non_member','lead','member',false,null,'pending',null,null,null,false,false,false),
 ('a0000000-0000-4000-8000-000000000013','seed-partner@704collective.dev','Seed Partner Vendor',null,'inactive',null,null,null,true,'partner','lead','partner',true,'vendor',null,null,null,null,false,false,false),
 ('a0000000-0000-4000-8000-000000000014','seed-unsubscribed@704collective.dev','Seed Unsubscribed','cus_SEED014','active','sub_SEED014',now()-interval '45 days',now()-interval '45 days',false,'social','lead','member',false,null,null,null,null,null,true,false,false)
on conflict (id) do update set
  email=excluded.email, full_name=excluded.full_name, stripe_customer_id=excluded.stripe_customer_id,
  subscription_status=excluded.subscription_status, subscription_id=excluded.subscription_id,
  member_since=excluded.member_since, first_payment_at=excluded.first_payment_at,
  membership_override=excluded.membership_override, member_type=excluded.member_type,
  role=excluded.role, account_type=excluded.account_type, is_partner=excluded.is_partner,
  partner_type=excluded.partner_type, application_status=excluded.application_status,
  deleted_at=excluded.deleted_at, canceled_at=excluded.canceled_at,
  subscription_ends_at=excluded.subscription_ends_at,
  marketing_unsubscribed=excluded.marketing_unsubscribed,
  is_locked_in_pricing=excluded.is_locked_in_pricing, is_internal=excluded.is_internal;

-- ---------- PEOPLE: the 3 Stage-5 bridge states ----------
insert into public.people (id, email, full_name, member_tier, member_status,
  stripe_customer_id, joined_at, canceled_at, metadata)
values
 -- HEALTHY bridge (metadata.profile_id set)
 ('b0000000-0000-4000-8000-000000000001','seed-social-49@704collective.dev','Seed Social FullPrice','social','active','cus_SEED002',now()-interval '90 days',null,jsonb_build_object('profile_id','a0000000-0000-4000-8000-000000000002')),
 ('b0000000-0000-4000-8000-000000000004','seed-biz-monthly@704collective.dev','Seed Business Monthly','business','active','cus_SEED004',now()-interval '120 days',null,jsonb_build_object('profile_id','a0000000-0000-4000-8000-000000000004')),
 -- STALE bridge (email matches a profile, NO profile_id) <- the Stage 5 seam
 ('b0000000-0000-4000-8000-000000000002','seed-social-35@704collective.dev','Seed Social Grandfathered','social','active','cus_SEED003',now()-interval '300 days',null,'{}'::jsonb),
 ('b0000000-0000-4000-8000-000000000005','seed-canceled@704collective.dev','Seed Canceled Clean','social','canceled','cus_SEED008',now()-interval '180 days',now()-interval '40 days','{}'::jsonb),
 -- ORPHAN (no matching profile at all)
 ('b0000000-0000-4000-8000-000000000003','seed-orphan@704collective.dev','Seed Orphan Person','social','inactive',null,now()-interval '365 days',null,'{}'::jsonb);

-- ---------- EVENTS ----------
insert into public.events (id, title, description, start_time, end_time, location_name,
  location_address, category, event_type, recurrence_rule, parent_event_id, occurrence_index,
  is_published)
values
 ('c0000000-0000-4000-8000-000000000001','SEED Coffee and Connect (weekly parent)','Seed recurring event for rehearsals',date_trunc('day',now())+interval '7 days'+interval '9 hours',date_trunc('day',now())+interval '7 days'+interval '11 hours','Seed Cafe','100 Seed St, Charlotte, NC','other','social','weekly',null,0,true),
 ('c0000000-0000-4000-8000-000000000002','SEED Coffee and Connect (weekly parent)','Seed recurring event for rehearsals',date_trunc('day',now())+interval '14 days'+interval '9 hours',date_trunc('day',now())+interval '14 days'+interval '11 hours','Seed Cafe','100 Seed St, Charlotte, NC','other','social',null,'c0000000-0000-4000-8000-000000000001',1,true),
 ('c0000000-0000-4000-8000-000000000003','SEED Dinner Club (one-off)','Seed one-off event for rehearsals',date_trunc('day',now())+interval '10 days'+interval '19 hours',date_trunc('day',now())+interval '10 days'+interval '22 hours','Seed Bistro','200 Seed Ave, Charlotte, NC','other','social',null,null,0,true);

-- ---------- TICKETS ----------
insert into public.tickets (user_id, event_id, ticket_type, status, guest_email, guest_name, amount_paid_cents)
values
 ('a0000000-0000-4000-8000-000000000002','c0000000-0000-4000-8000-000000000003','member_free','confirmed',null,null,0),
 ('a0000000-0000-4000-8000-000000000003','c0000000-0000-4000-8000-000000000003','member_free','cancelled',null,null,0),
 ('a0000000-0000-4000-8000-000000000004','c0000000-0000-4000-8000-000000000003','guest_pass','confirmed','seed-guest@704collective.dev','Seed Guest',0),
 ('a0000000-0000-4000-8000-000000000011','c0000000-0000-4000-8000-000000000003','public_paid','confirmed',null,null,2500);

-- ---------- ATTENDANCE CREDENTIALS ----------
insert into public.attendance_credentials (token, person_id, event_id, credential_type, status, used_at)
values
 ('seedtok-0001','b0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000002','member_rsvp','active',null),
 ('seedtok-0002','b0000000-0000-4000-8000-000000000004','c0000000-0000-4000-8000-000000000002','member_rsvp','used',now()-interval '1 day'),
 ('seedtok-0003','b0000000-0000-4000-8000-000000000002','c0000000-0000-4000-8000-000000000003','member','voided',null),
 ('seedtok-0004','b0000000-0000-4000-8000-000000000003','c0000000-0000-4000-8000-000000000003','public_rsvp','used',now()-interval '2 days'),
 ('seedtok-0005','b0000000-0000-4000-8000-000000000005','c0000000-0000-4000-8000-000000000003','member_rsvp','voided',null);

-- ---------- CONTACTS + PUBLIC RSVP ----------
insert into public.contacts (id, email, full_name, source, status, contact_type, unsubscribed)
values
 ('d0000000-0000-4000-8000-000000000001','seed-orphan@704collective.dev','Seed Orphan Person','manual','active','prospect',false),
 ('d0000000-0000-4000-8000-000000000002','seed-unsub-contact@704collective.dev','Seed Unsub Contact','manual','active','prospect',true);

insert into public.event_public_rsvps (event_id, contact_id, first_name, last_name, email, status)
values
 ('c0000000-0000-4000-8000-000000000003','d0000000-0000-4000-8000-000000000001','Seed','Orphan','seed-orphan@704collective.dev','rsvp');

-- ---------- PAYMENTS ----------
insert into public.payments (user_id, stripe_customer_id, amount, status, payment_type, description, created_at)
values
 ('a0000000-0000-4000-8000-000000000002','cus_SEED002',4900,'succeeded','subscription','SEED social monthly',now()-interval '35 days'),
 ('a0000000-0000-4000-8000-000000000002','cus_SEED002',4900,'succeeded','subscription','SEED social monthly',now()-interval '5 days'),
 ('a0000000-0000-4000-8000-000000000003','cus_SEED003',3500,'succeeded','subscription','SEED grandfathered monthly',now()-interval '8 days'),
 ('a0000000-0000-4000-8000-000000000004','cus_SEED004',30000,'succeeded','subscription','SEED business monthly',now()-interval '12 days'),
 ('a0000000-0000-4000-8000-000000000005','cus_SEED005',360000,'succeeded','subscription','SEED business annual',now()-interval '200 days'),
 ('a0000000-0000-4000-8000-000000000006','cus_SEED006',0,'succeeded','subscription','SEED 100pct coupon',now()-interval '15 days'),
 ('a0000000-0000-4000-8000-000000000008','cus_SEED008',4900,'succeeded','subscription','SEED last charge before clean cancel',now()-interval '70 days'),
 ('a0000000-0000-4000-8000-000000000009','cus_SEED009',4900,'succeeded','subscription','SEED drift: charged AFTER cancel',now()-interval '5 days'),
 ('a0000000-0000-4000-8000-000000000011',null,2500,'succeeded','one_time','SEED public paid ticket',now()-interval '9 days');

commit;
