/**
 * Delete and recreate QA test accounts with known password (service role).
 * Run: node --env-file=.env.local scripts/recreate-test-accounts.mjs
 *
 * Requires: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

const url =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error(
    'Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) or SUPABASE_SERVICE_ROLE_KEY'
  );
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const PASSWORD = 'Test1234!';

const ACCOUNTS = [
  {
    email: 'socialtest@704collective.com',
    full_name: 'Social Test',
    profile: {
      member_type: 'social',
      subscription_status: 'active',
    },
  },
  {
    email: 'businesstest@704collective.com',
    full_name: 'Business Test',
    profile: {
      member_type: 'business',
      subscription_status: 'active',
    },
  },
  {
    email: 'partnertest@704collective.com',
    full_name: 'Partner Test',
    profile: {
      member_type: 'partner',
      subscription_status: 'active',
      partner_status: 'approved',
      partner_types: ['partner', 'vendor', 'venue', 'sponsor'],
    },
  },
  {
    email: 'nonmembertest@704collective.com',
    full_name: 'Non-Member Test',
    profile: {
      member_type: 'social_non_member',
      subscription_status: 'inactive',
    },
  },
];

async function deleteUserByEmail(email) {
  const target = email.toLowerCase();
  let page = 1;
  const perPage = 200;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const found = data.users.find((u) => u.email?.toLowerCase() === target);
    if (found) {
      const { error: delErr } = await supabase.auth.admin.deleteUser(found.id);
      if (delErr) throw delErr;
      return { deleted: true, id: found.id };
    }
    if (data.users.length < perPage) break;
    page += 1;
  }
  return { deleted: false };
}

async function main() {
  for (const row of ACCOUNTS) {
    const { email, full_name, profile: prof } = row;
    process.stdout.write(`\n${email} … `);
    try {
      const del = await deleteUserByEmail(email);
      if (del.deleted) process.stdout.write('deleted existing; ');

      const { data: created, error: createErr } = await supabase.auth.admin.createUser({
        email,
        password: PASSWORD,
        email_confirm: true,
        user_metadata: { full_name },
      });
      if (createErr) throw createErr;
      if (!created.user) throw new Error('createUser returned no user');

      const id = created.user.id;
      const { error: upErr } = await supabase.from('profiles').upsert(
        {
          id,
          email,
          full_name,
          calendar_token: randomUUID(),
          membership_override: false,
          ...prof,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' }
      );
      if (upErr) throw upErr;

      console.log('OK (user + profile)');
    } catch (e) {
      console.error('FAILED', e?.message ?? e);
    }
  }
}

main();
