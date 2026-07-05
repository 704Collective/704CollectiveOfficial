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

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

await login(page, 'adam@cltbucketlist.com', 'ZiggyandPuck22!');
await page.goto(`${BASE}${EVENT}`, { waitUntil: 'networkidle' });
await page.getByPlaceholder(/Share something/).waitFor({ timeout: 30000 });

const ta = page.locator('textarea[placeholder*="Share something"]');
await ta.fill('6c regression');
await page.getByRole('button', { name: /^Post$/i }).last().click();
await page.waitForTimeout(3000);
const postCount = await page.getByText('6c regression', { exact: true }).count();
console.log('post visible count:', postCount);

const cards = page.locator('.space-y-3\\.5 > .card-elevated');
const cardCount = await cards.count();
console.log('card count:', cardCount);

const target = cards.filter({ hasText: '6c regression' }).last();
console.log('target cards:', await target.count());

const actionLike = target.locator('button').filter({ has: page.locator('.lucide-heart, svg') }).first();
console.log('actionLike count:', await actionLike.count());
await actionLike.click();
await page.waitForTimeout(1000);
const liked = (await target.locator('.fill-rose-500').count()) > 0;
console.log('liked:', liked);

await target.getByPlaceholder(/Write a comment/).fill('6c comment');
await target.getByRole('button', { name: 'Comment' }).click();
await target.getByText('6c comment').waitFor({ timeout: 15000 });
console.log('comment: ok');

const gc = page.locator('.card-elevated').filter({ has: page.getByRole('button', { name: 'Add photos' }) });
const nBefore = parseInt(((await gc.locator('h3').first().textContent()).match(/(\d+)/) || ['0', '0'])[1], 10);

await page.getByRole('button', { name: /Photo\/Video/i }).click();
await page.locator('input[type="file"]').first().setInputFiles(PNG);
await ta.fill('6c composer image');
await page.getByRole('button', { name: /^Post$/i }).last().click();
await page.getByText('6c composer image').waitFor({ timeout: 30000 });
console.log('composer image post: ok');

await page.reload({ waitUntil: 'networkidle' });
await page.getByPlaceholder(/Share something/).waitFor();
const nAfter = parseInt(((await gc.locator('h3').first().textContent()).match(/(\d+)/) || ['0', '0'])[1], 10);
console.log('STEP 10:', liked && nAfter === nBefore + 1 ? 'PASS' : 'FAIL', `gallery ${nBefore}->${nAfter}`);

await page.goto(`${BASE}/login`);
await page.evaluate(() => Object.keys(localStorage).filter(k => k.includes('sb-')).forEach(k => localStorage.removeItem(k)));
await login(page, 'socialtest@704collective.com', 'Test1234!');
await page.goto(`${BASE}${EVENT}`, { waitUntil: 'networkidle' });
const lock = await page.getByText(/This discussion is for members going to/).isVisible({ timeout: 15000 });
console.log('RLS:', lock && !(await page.getByRole('button', { name: 'Add photos' }).count()) && !(await page.getByPlaceholder(/Share something/).count()) ? 'PASS' : 'FAIL',
  { lock, addPhotos: await page.getByRole('button', { name: 'Add photos' }).count(), composer: await page.getByPlaceholder(/Share something/).count() });

await browser.close();
