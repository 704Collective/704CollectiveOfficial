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
for (const path of ['/dashboard', '/events/my-tickets', '/tickets']) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  const links = await page.locator('a[href*="/events/"]').evaluateAll(els =>
    [...new Set(els.map(a => a.getAttribute('href')))]
  );
  console.log(path, links.slice(0, 15));
}
await browser.close();
