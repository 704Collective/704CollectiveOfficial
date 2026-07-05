import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PNG = path.resolve(__dirname, '6b-test.png');
const BASE = 'http://127.0.0.1:3000';
const EVENT = '/events/1af4d505-d667-4ef6-933f-0d29764b3655/discussion';

async function login(page, email, pass) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Password', exact: true }).click();
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(pass);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForFunction(() => !window.location.pathname.endsWith('/login'), { timeout: 45000 });
}

async function clearAuth(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => Object.keys(localStorage).filter(k => k.includes('sb-')).forEach(k => localStorage.removeItem(k)));
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

await login(page, 'adam@cltbucketlist.com', 'ZiggyandPuck22!');
await page.goto(`${BASE}${EVENT}`, { waitUntil: 'networkidle' });
await page.getByPlaceholder(/Share something/).waitFor({ timeout: 30000 });

const ta = page.locator('textarea[placeholder*="Share something"]');
if ((await page.getByText('6c regression', { exact: true }).count()) === 0) {
  await ta.fill('6c regression');
  await page.getByRole('button', { name: /^Post$/i }).last().click();
  await page.getByText('6c regression', { exact: true }).waitFor({ timeout: 30000 });
}

const post = page.locator('.space-y-3\\.5 > .card-elevated').filter({ has: page.getByText('6c regression', { exact: true }) }).last();
await post.locator('button[aria-label^="Like"], button[aria-label^="Unlike"]').click();
await page.waitForTimeout(800);
const liked = (await post.locator('.fill-rose-500').count()) > 0;

if ((await post.getByText('6c comment').count()) === 0) {
  await post.getByPlaceholder(/Write a comment/).fill('6c comment');
  await post.getByRole('button', { name: 'Comment' }).click();
  await post.getByText('6c comment').waitFor({ timeout: 15000 });
}
const commented = (await post.getByText('6c comment').count()) > 0;

const gc = page.locator('.card-elevated').filter({ has: page.getByRole('button', { name: 'Add photos' }) });
const gBefore = await gc.locator('h3').first().textContent();
const nBefore = parseInt((gBefore.match(/(\d+)/) || ['0', '0'])[1], 10);

if ((await page.getByText('6c composer image').count()) === 0) {
  await page.locator('input[type="file"]').first().setInputFiles(PNG);
  await ta.fill('6c composer image');
  await page.getByRole('button', { name: /^Post$/i }).last().click();
  await page.getByText('6c composer image').waitFor({ timeout: 30000 });
}
await page.reload({ waitUntil: 'networkidle' });
await page.getByPlaceholder(/Share something/).waitFor();
const gAfter = await gc.locator('h3').first().textContent();
const nAfter = parseInt((gAfter.match(/(\d+)/) || ['0', '0'])[1], 10);

console.log('STEP 10:', liked && commented && nAfter >= nBefore + 1 ? 'PASS' : 'FAIL',
  `like=${liked}, comment=${commented}, gallery ${nBefore}->${nAfter} after reload`);

await clearAuth(page);
await login(page, 'socialtest@704collective.com', 'Test1234!');
await page.goto(`${BASE}${EVENT}`, { waitUntil: 'networkidle' });
const lock = await page.getByText(/This discussion is for members going to/).isVisible({ timeout: 15000 });
const noAdd = (await page.getByRole('button', { name: 'Add photos' }).count()) === 0;
const noComp = (await page.getByPlaceholder(/Share something/).count()) === 0;
const noPosts = (await page.locator('.space-y-3\\.5 > .card-elevated').count()) === 0;
console.log('RLS:', lock && noAdd && noComp && noPosts ? 'PASS' : 'FAIL', { lock, noAdd, noComp, noPosts });

await browser.close();
