import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:3000';

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
await page.goto(`${BASE}/events`, { waitUntil: 'networkidle' });
await page.waitForTimeout(3000);
console.log('url', page.url());
console.log('links', await page.locator('a').evaluateAll(els => els.map(a => ({ href: a.getAttribute('href'), text: a.textContent?.trim().slice(0,40) })).filter(x => x.href?.includes('event')).slice(0,20)));
await page.screenshot({ path: 'test-assets/events-debug.png', fullPage: true });
await browser.close();
