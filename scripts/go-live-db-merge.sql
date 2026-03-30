-- 704 Collective Go-Live DB Merge Script
-- Run this in Supabase SQL Editor BEFORE DNS cutover
-- Verify the SELECT output at the bottom before proceeding with DNS cutover

-- Founders / super admins
UPDATE public.profiles
SET
  role = 'super_admin',
  membership_override = true,
  member_type = 'business',
  subscription_status = 'active'
WHERE lower(trim(email)) IN (
  lower(trim('adam@cltbucketlist.com')),
  lower(trim('timi@cltbucketlist.com')),
  lower(trim('ahart.josh@gmail.com')),
  lower(trim('baumanngabbi@gmail.com')),
  lower(trim('hello@704collective.com'))
);

-- Admins
UPDATE public.profiles
SET
  role = 'admin',
  membership_override = true,
  member_type = 'business',
  subscription_status = 'active'
WHERE lower(trim(email)) IN (
  lower(trim('ahandleton@gmail.com')),
  lower(trim('nickstat24@gmail.com'))
);

-- Verification: all seven accounts
SELECT
  email,
  role,
  member_type,
  membership_override,
  subscription_status
FROM public.profiles
WHERE lower(trim(email)) IN (
  lower(trim('adam@cltbucketlist.com')),
  lower(trim('timi@cltbucketlist.com')),
  lower(trim('ahart.josh@gmail.com')),
  lower(trim('baumanngabbi@gmail.com')),
  lower(trim('hello@704collective.com')),
  lower(trim('ahandleton@gmail.com')),
  lower(trim('nickstat24@gmail.com'))
)
ORDER BY email;
