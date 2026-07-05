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
const consoleLogs = [];
page.on('console', m => consoleLogs.push(`[${m.type()}] ${m.text()}`));

await login(page, 'adam@cltbucketlist.com', 'ZiggyandPuck22!');
await page.goto(`${BASE}${EVENT}`, { waitUntil: 'networkidle' });
await page.getByPlaceholder(/Share something/).waitFor({ timeout: 30000 });

// Text-only post attempt
await page.locator('textarea[placeholder*="Share something"]').fill('6c regression');
await page.getByRole('button', { name: /^Post$/i }).last().click();
await page.waitForTimeout(2000);
const textPostErr = consoleLogs.some(l => l.includes('image_urls') && l.includes('not-null'));
const textPostVisible = (await page.locator('.space-y-3\\.5').getByText('6c regression', { exact: true }).count()) > 0;
console.log('text-only post:', textPostVisible ? 'PASS' : 'FAIL', textPostErr ? '(DB: image_urls NOT NULL blocks text-only)' : '');

// Like + comment on first existing post
const firstPost = page.locator('.space-y-3\\.5 > .card-elevated').first();
await firstPost.locator('button[aria-label*="Like"]').click();
await page.waitForTimeout(800);
const liked = (await firstPost.locator('.fill-rose-500').count()) > 0;
await firstPost.getByPlaceholder(/Write a comment/).fill('6c comment');
await firstPost.getByRole('button', { name: 'Comment' }).click();
await firstPost.getByText('6c comment').waitFor({ timeout: 15000 });
const commented = (await firstPost.getByText('6c comment').count()) > 0;

const gc = page.locator('.card-elevated').filter({ has: page.getByRole('button', { name: 'Add photos' }) });
const nBefore = parseInt(((await gc.locator('h3').first().textContent()).match(/(\d+)/) || ['0', '0'])[1], 10);

await page.getByRole('button', { name: /Photo\/Video/i }).click();
await page.locator('input[type="file"]').first().setInputFiles(PNG);
await page.locator('textarea[placeholder*="Share something"]').fill('6c composer image');
await page.getByRole('button', { name: /^Post$/i }).last().click();
await page.getByText('6c composer image').waitFor({ timeout: 30000 });
const composerPostOk = (await page.getByText('6c composer image').count()) > 0;

await page.reload({ waitUntil: 'networkidle' });
await page.getByPlaceholder(/Share something/).waitFor();
const nAfter = parseInt(((await gc.locator('h3').first().textContent()).match(/(\d+)/) || ['0', '0'])[1], 10);

console.log('like:', liked ? 'PASS' : 'FAIL');
console.log('comment:', commented ? 'PASS' : 'FAIL');
console.log('composer image post:', composerPostOk ? 'PASS' : 'FAIL');
console.log('gallery auto-collect:', nAfter === nBefore + 1 ? 'PASS' : 'FAIL', `${nBefore}->${nAfter} after reload`);

// RLS
await page.goto(`${BASE}/login`);
await page.evaluate(() => Object.keys(localStorage).filter(k => k.includes('sb-')).forEach(k => localStorage.removeItem(k)));
await login(page, 'socialtest@704collective.com', 'Test1234!');
await page.goto(`${BASE}${EVENT}`, { waitUntil: 'networkidle' });
const lock = await page.getByText(/This discussion is for members going to/).isVisible({ timeout: 15000 });
const noAdd = (await page.getByRole('button', { name: 'Add photos' }).count()) === 0;
const noComp = (await page.getByPlaceholder(/Share something/).count()) === 0;
const noPosts = (await page.locator('.space-y-3\\.5 > .card-elevated').count()) === 0;
console.log('RLS:', lock && noAdd && noComp && noPosts ? 'PASS' : 'FAIL', { lock, noAdd, noComp, noPosts });

await browser.close();
