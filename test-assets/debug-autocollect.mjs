import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PNG = path.resolve(__dirname, '6b-test.png');
const BASE = 'http://127.0.0.1:3000';
const EVENT = '/events/1af4d505-d667-4ef6-933f-0d29764b3655/discussion';

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Password', exact: true }).click();
  await page.locator('#email').fill('adam@cltbucketlist.com');
  await page.locator('#password').fill('ZiggyandPuck22!');
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForFunction(() => !window.location.pathname.endsWith('/login'), { timeout: 45000 });
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const logs = [];
page.on('response', async r => {
  if (r.url().includes('event_discussion_photos') && r.request().method() === 'POST') {
    logs.push(`photos POST ${r.status()} ${await r.text().catch(() => '')}`);
  }
});

await login(page);
await page.goto(`${BASE}${EVENT}`, { waitUntil: 'networkidle' });
await page.getByPlaceholder(/Share something/).waitFor();

const gc = page.locator('.card-elevated').filter({ has: page.getByRole('button', { name: 'Add photos' }) });
const before = await gc.locator('h3').first().textContent();
console.log('before:', before);

await page.getByRole('button', { name: /Photo\/Video/i }).click();
await page.locator('input[type="file"]').first().setInputFiles(PNG);
await page.locator('textarea[placeholder*="Share something"]').fill('6c collect test');
await page.getByRole('button', { name: /^Post$/i }).last().click();
await page.getByText('6c collect test').waitFor({ timeout: 30000 });
await page.waitForTimeout(2000);
const afterLive = await gc.locator('h3').first().textContent();
console.log('after live (no reload):', afterLive);

await page.reload({ waitUntil: 'networkidle' });
await page.getByPlaceholder(/Share something/).waitFor();
const afterReload = await gc.locator('h3').first().textContent();
console.log('after reload:', afterReload);
console.log('photo inserts:', logs);

await browser.close();
