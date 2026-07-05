import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:3000';
const EVENT = '/events/1af4d505-d667-4ef6-933f-0d29764b3655/discussion';
const consoleLogs = [];
const results = [];

function log(test, pass, detail) {
  results.push({ test, pass, detail });
  console.log(`TEST ${test}: ${pass ? 'PASS' : 'FAIL'} — ${detail}`);
}

function cspErrors() {
  return consoleLogs.filter(l =>
    /Content Security Policy|violates the following|Refused to connect|CORS policy/i.test(l) &&
    /r2\.dev|cloudflarestorage/i.test(l)
  );
}

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Password', exact: true }).click();
  await page.locator('#email').fill('adam@cltbucketlist.com');
  await page.locator('#password').fill('ZiggyandPuck22!');
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForFunction(() => !window.location.pathname.endsWith('/login'), { timeout: 45000 });
}

async function openDiscussion(page) {
  await page.goto(`${BASE}${EVENT}`, { waitUntil: 'networkidle' });
  await page.getByPlaceholder(/Share something/).waitFor({ timeout: 30000 });
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
page.on('console', m => consoleLogs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', e => consoleLogs.push(`[pageerror] ${e.message}`));

await login(page);
await openDiscussion(page);

// TEST 1 — text-only post
try {
  const errStart = consoleLogs.length;
  const ta = page.locator('textarea[placeholder*="Share something"]');
  await ta.fill('6c textonly retest');
  const postResp = page.waitForResponse(
    r => r.url().includes('event_discussion_posts') && r.request().method() === 'POST',
    { timeout: 15000 }
  );
  await page.getByRole('button', { name: /^Post$/i }).last().click();
  const resp = await postResp;
  await page.waitForFunction(() => {
    const t = document.querySelector('textarea[placeholder*="Share something"]');
    return t && t.value === '';
  }, { timeout: 30000 });
  const postVisible = (await page.locator('.space-y-3\\.5').getByText('6c textonly retest', { exact: true }).count()) > 0;
  const notNullErr = consoleLogs.slice(errStart).some(l => l.includes('image_urls') && l.includes('not-null'));
  log(1, resp.status() === 201 && postVisible && !notNullErr,
    `status=${resp.status()}, composerCleared=true, postVisible=${postVisible}, notNullErr=${notNullErr}`);
} catch (e) {
  log(1, false, e.message.split('\n')[0]);
}

// TEST 2 — gallery download
try {
  const errStart = consoleLogs.length;
  const gallery = page.locator('.card-elevated').filter({ has: page.getByRole('button', { name: 'Add photos' }) });
  const hasStrip = (await gallery.locator('button.flex.gap-2').count()) > 0;
  if (!hasStrip) {
    log(2, false, 'No gallery photos to test download');
  } else {
    await gallery.locator('button.flex.gap-2').click();
    await page.locator('h3.text-sm.font-bold').filter({ hasText: /^Gallery · \d+$/ }).waitFor({ timeout: 5000 });
    await page.locator('.grid.grid-cols-3 button.aspect-square, .grid.sm\\:grid-cols-4 button.aspect-square').first().click();
    await page.getByRole('button', { name: 'Download' }).waitFor({ timeout: 5000 });
    const downloadPromise = page.waitForEvent('download', { timeout: 15000 });
    await page.getByRole('button', { name: 'Download' }).click();
    const download = await downloadPromise;
    const filename = download.suggestedFilename();
    await download.path();
    const cspErrs = cspErrors().slice(errStart);
    log(2, !!filename && cspErrs.length === 0, `filename=${filename}, cspErrs=${cspErrs.length}`);
  }
} catch (e) {
  const cspErrs = cspErrors();
  log(2, false, `${e.message.split('\n')[0]}; cspErrs=${cspErrs.length}`);
}

console.log('\n===== CONSOLE ERRORS (verbatim) =====');
const errs = consoleLogs.filter(l => /\[error\]|pageerror/i.test(l));
if (errs.length === 0) console.log('(none)');
else errs.forEach(l => console.log(l));

await browser.close();
process.exit(results.some(r => !r.pass) ? 1 : 0);
