/**
 * Production notification bell visibility tests (post-deploy).
 * Run: node --env-file=.env.local scripts/test-notification-bell-prod.mjs
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const BASE = 'https://704collective.com';
const PASSWORD = 'Test1234!';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin =
  url && serviceKey
    ? createClient(url, serviceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    : null;

const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'mobile', width: 390, height: 844 },
];

const ACCOUNTS = [
  {
    id: 'socialtest',
    email: 'socialtest@704collective.com',
    loginPath: '/login',
    targetPath: '/dashboard',
    expectBell: true,
    screenshotDesktop: 'socialtest-bell-visible.png',
  },
  {
    id: 'adam-admin',
    email: 'adam@cltbucketlist.com',
    loginPath: '/admin/login',
    targetPath: '/admin',
    altTargetPath: '/dashboard',
    expectBell: true,
    magicLinkFallback: true,
  },
  {
    id: 'partnertest',
    email: 'partnertest@704collective.com',
    loginPath: '/login',
    targetPath: '/dashboard',
    expectBell: true,
  },
  {
    id: 'nonmembertest',
    email: 'nonmembertest@704collective.com',
    loginPath: '/login',
    targetPath: '/dashboard',
    expectBell: false,
    screenshotDesktop: 'nonmembertest-bell-absent.png',
  },
];

async function loginMember(page, email, password) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Password', exact: true }).click();
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Sign in with password' }).click();
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 30_000 });
}

async function loginAdminPassword(page, email, password) {
  await page.goto(`${BASE}/admin/login`, { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForTimeout(2000);
  const current = page.url();
  if (current.includes('/admin/login')) {
    const errText = await page.locator('[role="alert"], .text-destructive').first().textContent().catch(() => null);
    throw new Error(errText?.trim() || 'Admin password login failed');
  }
}

async function loginMagicLink(page, email) {
  if (!supabaseAdmin) throw new Error('Missing Supabase service role for magic link');
  const { data, error } = await supabaseAdmin.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: { redirectTo: `${BASE}/auth/callback` },
  });
  if (error) throw error;
  const tokenHash = data?.properties?.hashed_token;
  if (!tokenHash) throw new Error('No hashed_token from generateLink');
  await page.goto(`${BASE}/auth/callback?token_hash=${tokenHash}&type=magiclink`, {
    waitUntil: 'networkidle',
    timeout: 45_000,
  });
}

async function loginAccount(page, account) {
  const { email, loginPath, magicLinkFallback } = account;
  if (loginPath === '/admin/login') {
    try {
      await loginAdminPassword(page, email, PASSWORD);
      return 'admin-password';
    } catch {
      if (!magicLinkFallback) throw new Error('Admin login failed');
      await loginMagicLink(page, email);
      return 'magic-link';
    }
  }
  await loginMember(page, email, PASSWORD);
  return 'member-password';
}

async function openAdminMobileNavIfNeeded(page, viewportName) {
  if (viewportName !== 'mobile') return;
  if (!page.url().includes('/admin')) return;
  const openNav = page.getByRole('button', { name: 'Open navigation' });
  if (await openNav.isVisible().catch(() => false)) {
    await openNav.click();
    await page.waitForTimeout(500);
  }
}

async function checkBell(page, viewportName) {
  await openAdminMobileNavIfNeeded(page, viewportName);

  const anyBell = page.getByRole('button', { name: /^Notifications/ });
  const headerBell = page.locator('header').getByRole('button', { name: /^Notifications/ });

  const anyVisible = await anyBell.first().isVisible().catch(() => false);
  const headerVisible = await headerBell.first().isVisible().catch(() => false);

  return { anyVisible, headerVisible };
}

async function runCase(browser, account, viewport) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();
  const consoleErrors = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(err.message));

  let loginMethod = 'unknown';
  let error = null;
  let bell = { anyVisible: false, headerVisible: false };
  let pass = false;

  try {
    loginMethod = await loginAccount(page, account);
    if (!page.url().includes(account.targetPath.split('?')[0])) {
      await page.goto(`${BASE}${account.targetPath}`, { waitUntil: 'networkidle', timeout: 45_000 });
    }
    await page.waitForTimeout(1500);
    bell = await checkBell(page, viewport.name);

    if (!bell.anyVisible && account.altTargetPath && page.url().includes('/admin')) {
      await page.goto(`${BASE}${account.altTargetPath}`, { waitUntil: 'networkidle', timeout: 45_000 });
      await page.waitForTimeout(1500);
      bell = await checkBell(page, viewport.name);
    }

    pass = bell.anyVisible === account.expectBell;

    if (account.screenshotDesktop && viewport.name === 'desktop') {
      const shotDir = join(process.cwd(), 'e2e', 'screenshots');
      await mkdir(shotDir, { recursive: true });
      await page.screenshot({ path: join(shotDir, account.screenshotDesktop), fullPage: false });
    }
  } catch (e) {
    error = e?.message ?? String(e);
    pass = false;
  }

  const result = {
    account: account.id,
    email: account.email,
    viewport: viewport.name,
    pass,
    expectBell: account.expectBell,
    notificationsButtonVisible: bell.anyVisible,
    headerNotificationsVisible: bell.headerVisible,
    finalUrl: page.url(),
    loginMethod,
    consoleErrors: [...new Set(consoleErrors)].slice(0, 10),
    error,
  };

  await context.close();
  return result;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const results = [];

  for (const account of ACCOUNTS) {
    for (const viewport of VIEWPORTS) {
      process.stdout.write(`Testing ${account.id} @ ${viewport.name} … `);
      const result = await runCase(browser, account, viewport);
      results.push(result);
      console.log(result.pass ? 'PASS' : 'FAIL');
    }
  }

  await browser.close();

  const outPath = join(process.cwd(), 'e2e', 'screenshots', 'notification-bell-results.json');
  await mkdir(join(process.cwd(), 'e2e', 'screenshots'), { recursive: true });
  await writeFile(outPath, JSON.stringify(results, null, 2));

  console.log('\n=== RESULTS JSON ===');
  console.log(JSON.stringify(results, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
