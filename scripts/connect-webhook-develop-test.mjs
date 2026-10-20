import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import Stripe from 'stripe';

const DEV = 'rlypudgmskdonxjtjreb';
const PROD = 'bnmtynevbuplqpuqvmna';
const FN = `https://${DEV}.supabase.co/functions/v1/stripe-connect-webhook`;

function assertDev(ref) {
  if (ref === PROD || String(ref).includes(PROD)) throw new Error('ABORT: production ref');
  if (ref !== DEV) throw new Error('ABORT: unexpected ref');
}

function logicBlock(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const start = lines.findIndex((line) => line === '      case "account.updated": {');
  if (start < 0) throw new Error('case block missing');
  const end = lines.findIndex((line, i) => i > start && line === '      }');
  if (end < 0) throw new Error('case block end missing');
  return lines.slice(start, end + 1).join('\n');
}

function proveSharedMatches() {
  const webhook = fs.readFileSync('supabase/functions/stripe-webhook/index.ts', 'utf8');
  const shared = fs.readFileSync('supabase/functions/_shared/connectAccountUpdated.ts', 'utf8');
  const a = logicBlock(webhook);
  const b = logicBlock(shared);
  if (a !== b) {
    console.error('LOGIC_DIFF');
    process.exit(1);
  }
  console.log('LOGIC_MATCH lines=' + a.split('\n').length);
}

function stripeTestKey() {
  const text = fs.readFileSync('.env.development.local', 'utf8');
  const line = text.split(/\n/).find((row) => row.startsWith('STRIPE_SECRET_KEY='));
  if (!line) throw new Error('ABORT: no STRIPE_SECRET_KEY in .env.development.local');
  let value = line.slice('STRIPE_SECRET_KEY='.length).trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  return value;
}

async function developQuery(token, query) {
  assertDev(DEV);
  const res = await fetch(`https://api.supabase.com/v1/projects/${DEV}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error('SQL_HTTP_' + res.status + ' ' + text.slice(0, 400));
  return JSON.parse(text);
}

function accountEvent(id, account) {
  return {
    id,
    object: 'event',
    api_version: '2025-08-27.basil',
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    type: 'account.updated',
    data: { object: account },
  };
}

async function postSigned(stripe, secret, body) {
  const payload = JSON.stringify(body);
  const header = stripe.webhooks.generateTestHeaderString({ payload, secret });
  const res = await fetch(FN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'stripe-signature': header },
    body: payload,
  });
  const text = await res.text();
  return { status: res.status, text };
}

proveSharedMatches();

const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) throw new Error('ABORT: SUPABASE_ACCESS_TOKEN is not set');

const stripeKey = stripeTestKey();
if (!stripeKey.startsWith('sk_test_')) throw new Error('ABORT: STRIPE_SECRET_KEY is not sk_test_');
if (stripeKey.startsWith('sk_live_')) throw new Error('ABORT: live Stripe key');
console.log('STRIPE_KEY_PREFIX=sk_test_');

const webhookSecret = 'whsec_' + crypto.randomBytes(32).toString('base64');
const setRes = await fetch(`https://api.supabase.com/v1/projects/${DEV}/secrets`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify([{ name: 'STRIPE_CONNECT_WEBHOOK_SECRET', value: webhookSecret }]),
});
if (!setRes.ok) throw new Error('SET_SECRET_HTTP_' + setRes.status);
console.log('CONNECT_SECRET_SET');
const deploy = spawnSync('supabase', [
  'functions', 'deploy', 'stripe-connect-webhook',
  '--project-ref', DEV,
  '--no-verify-jwt',
  '--use-api',
], { stdio: 'inherit', shell: true });
if (deploy.status !== 0) throw new Error('ABORT: develop deploy failed');

const stripe = new Stripe(stripeKey);

const existing = await developQuery(token, `
  select id, stripe_account_status
  from public.ambassadors
  where email = 'seed-connect-webhook@704collective.dev'
  limit 1
`);
let ambassadorId = existing[0]?.id;
const uuidOk = (value) => /^[0-9a-f-]{36}$/i.test(value ?? '');
if (!ambassadorId) {
  const inserted = await developQuery(token, `
    insert into public.ambassadors (full_name, email, referral_code, stripe_account_status, type)
    values ('Connect Webhook Seed', 'seed-connect-webhook@704collective.dev', 'seed-connect-webhook', 'onboarding', 'member')
    returning id, stripe_account_status
  `);
  ambassadorId = inserted[0].id;
}
if (!uuidOk(ambassadorId)) throw new Error('ABORT: ambassador id is not a uuid');
console.log('AMBASSADOR', ambassadorId);

await developQuery(token, `
  update public.ambassadors
  set stripe_account_status = 'onboarding',
      stripe_onboarding_completed_at = null,
      stripe_account_id = null
  where id = '${ambassadorId}'
`);

const connected = await stripe.accounts.create({
  type: 'express',
  country: 'US',
  email: 'seed-connect-webhook@704collective.dev',
  capabilities: {
    card_payments: { requested: true },
    transfers: { requested: true },
  },
  metadata: { ambassador_id: ambassadorId },
});
const base = await stripe.accounts.retrieve(connected.id);
const modeKeys = Object.keys(base).filter((key) => /live|mode|test/i.test(key));
console.log('CONNECTED', connected.id, 'livemode', base.livemode, 'mode_keys', modeKeys.join(','));
if (base.livemode === true) throw new Error('ABORT: connected account is live');
if (base.livemode !== false && modeKeys.length > 0) throw new Error('ABORT: unexpected mode field');
const activeAccount = {
  ...base,
  details_submitted: true,
  charges_enabled: true,
  payouts_enabled: true,
  metadata: { ...base.metadata, ambassador_id: ambassadorId },
  requirements: { ...(base.requirements ?? {}), disabled_reason: null },
};
const activeEventId = 'evt_connect_seed_active_' + Date.now();
const first = await postSigned(stripe, webhookSecret, accountEvent(activeEventId, activeAccount));
console.log('ACTIVE_POST', first.status, first.text.slice(0, 180));
if (first.status !== 200) throw new Error('active event failed');

const afterActive = await developQuery(token, `
  select stripe_account_status, stripe_onboarding_completed_at
  from public.ambassadors where id = '${ambassadorId}'
`);
const completedAt = afterActive[0].stripe_onboarding_completed_at;
console.log('AFTER_ACTIVE', afterActive[0].stripe_account_status, 'completed', Boolean(completedAt));
if (afterActive[0].stripe_account_status !== 'active' || !completedAt) throw new Error('status did not move to active');

const replay = await postSigned(stripe, webhookSecret, accountEvent(activeEventId, activeAccount));
console.log('REPLAY', replay.status, replay.text.slice(0, 180));
if (replay.status !== 200 || !replay.text.includes('already processed')) throw new Error('replay was not ignored');
const afterReplay = await developQuery(token, `
  select stripe_account_status, stripe_onboarding_completed_at,
    (select count(*) from public.processed_webhook_events where stripe_event_id = '${activeEventId}') as n
  from public.ambassadors where id = '${ambassadorId}'
`);
console.log('AFTER_REPLAY', afterReplay[0].stripe_account_status, 'same_completed', afterReplay[0].stripe_onboarding_completed_at === completedAt, 'rows', afterReplay[0].n);
if (afterReplay[0].stripe_onboarding_completed_at !== completedAt) throw new Error('replay wrote again');
if (Number(afterReplay[0].n) !== 1) throw new Error('processed row count ' + afterReplay[0].n);

const restrictedAccount = {
  ...base,
  details_submitted: false,
  charges_enabled: false,
  payouts_enabled: false,
  metadata: { ...base.metadata, ambassador_id: ambassadorId },
  requirements: { ...(base.requirements ?? {}), disabled_reason: 'requirements.past_due' },
};
const restricted = await postSigned(
  stripe,
  webhookSecret,
  accountEvent('evt_connect_seed_restricted_' + Date.now(), restrictedAccount),
);
console.log('RESTRICTED_POST', restricted.status, restricted.text.slice(0, 180));
if (restricted.status !== 200) throw new Error('restricted event failed');
const afterRestricted = await developQuery(token, `
  select stripe_account_status, stripe_onboarding_completed_at
  from public.ambassadors where id = '${ambassadorId}'
`);
console.log('AFTER_RESTRICTED', afterRestricted[0].stripe_account_status, 'completed_kept', afterRestricted[0].stripe_onboarding_completed_at === completedAt);
if (afterRestricted[0].stripe_account_status !== 'restricted') throw new Error('status did not move to restricted');

const bad = await fetch(FN, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'stripe-signature': 't=1,v1=deadbeef' },
  body: JSON.stringify(accountEvent('evt_connect_seed_bad_' + Date.now(), activeAccount)),
});
const badText = await bad.text();
console.log('BAD_SIGNATURE', bad.status, badText.slice(0, 120));
if (bad.status !== 400) throw new Error('bad signature status ' + bad.status);

const getRes = await fetch(FN, { method: 'GET' });
console.log('GET', getRes.status);
if (getRes.status !== 405) throw new Error('GET status ' + getRes.status);

console.log('PASS');
