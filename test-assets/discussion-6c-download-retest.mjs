import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:3000';
const EVENT = '/events/1af4d505-d667-4ef6-933f-0d29764b3655/discussion';
const consoleLogs = [];

function corsCspErrors() {
  return consoleLogs.filter(l =>
    /CORS policy|Content Security Policy|violates the following|Refused to connect|Refused to fetch/i.test(l)
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

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  acceptDownloads: true,
  viewport: { width: 1440, height: 900 },
});
const page = await context.newPage();

// Disable cache via CDP (fresh R2 responses with CORS headers)
const cdp = await context.newCDPSession(page);
await cdp.send('Network.enable');
await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });

page.on('console', m => consoleLogs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', e => consoleLogs.push(`[pageerror] ${e.message}`));

await login(page);
await page.goto(`${BASE}${EVENT}`, { waitUntil: 'networkidle' });
await page.getByPlaceholder(/Share something/).waitFor({ timeout: 30000 });

const gallery = page.locator('.card-elevated').filter({ has: page.getByRole('button', { name: 'Add photos' }) });
await gallery.locator('h3').filter({ hasText: /Gallery · \d+/ }).waitFor({ timeout: 30000 });

// Hard reload with cache bypass, then wait for gallery again
await cdp.send('Page.reload', { ignoreCache: true });
await page.getByPlaceholder(/Share something/).waitFor({ timeout: 30000 });
await gallery.locator('button.flex.gap-2').waitFor({ timeout: 30000 });

const errStart = consoleLogs.length;
const hasStrip = (await gallery.locator('button.flex.gap-2').count()) > 0;

let pass = false;
let detail = '';

if (!hasStrip) {
  detail = 'No gallery photos available to test';
} else {
  try {
    await gallery.locator('button.flex.gap-2').click();
    await page.locator('h3.text-sm.font-bold').filter({ hasText: /^Gallery · \d+$/ }).waitFor({ timeout: 5000 });
    await page.locator('.grid.grid-cols-3 button.aspect-square, .grid.sm\\:grid-cols-4 button.aspect-square').first().click();
    await page.getByRole('button', { name: 'Download' }).waitFor({ timeout: 5000 });

    const downloadPromise = page.waitForEvent('download', { timeout: 20000 });
    await page.getByRole('button', { name: 'Download' }).click();
    const download = await downloadPromise;
    const filename = download.suggestedFilename();
    const path = await download.path();
    await page.waitForTimeout(1000);

    const errs = corsCspErrors().slice(errStart);
    pass = !!filename && !!path && errs.length === 0;
    detail = `filename=${filename}, saved=${!!path}, corsCspErrs=${errs.length}`;
  } catch (e) {
    const errs = corsCspErrors().slice(errStart);
    detail = `${e.message.split('\n')[0]}; corsCspErrs=${errs.length}`;
  }
}

console.log(`TEST Download: ${pass ? 'PASS' : 'FAIL'} — ${detail}`);
console.log('\n===== CONSOLE ERRORS (verbatim) =====');
const errs = consoleLogs.filter(l => /\[error\]|pageerror/i.test(l)).slice(errStart);
if (errs.length === 0) console.log('(none)');
else errs.forEach(l => console.log(l));

await browser.close();
process.exit(pass ? 0 : 1);
