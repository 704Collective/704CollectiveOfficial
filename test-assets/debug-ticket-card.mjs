import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:3000';
const SOUTHERN = '1af4d505-d667-4ef6-933f-0d29764b3655';

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
await login(page);
await page.goto(`${BASE}/events/${SOUTHERN}`, { waitUntil: 'networkidle' });
await page.waitForTimeout(4000);
const cardText = await page.locator('#ticket-card').innerText();
console.log('TICKET CARD TEXT:\n', cardText);
console.log('\nJoin link count:', await page.getByRole('link', { name: 'Join the Discussion' }).count());
console.log('Grey box count:', await page.getByText('Discussion opens 5 days before the event').count());
await browser.close();
