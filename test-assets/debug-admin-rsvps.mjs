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
const hrefs = await page.locator('a[href^="/events/"]').evaluateAll(els =>
  [...new Set(els.map(a => a.getAttribute('href')).filter(h => h && /^\/events\/[0-9a-f-]{36}$/.test(h)))]
);

for (const href of hrefs) {
  await page.goto(`${BASE}${href}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const card = page.locator('#ticket-card');
  const text = await card.innerText().catch(() => '');
  if (/You.re RSVP.d!/i.test(text)) {
    const join = await card.getByRole('link', { name: 'Join the Discussion' }).count();
    const grey = await card.getByText('Discussion opens 5 days before the event').count();
    const date = (await page.locator('body').innerText()).match(/(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday), [A-Za-z]+ \d{1,2}, \d{4}/)?.[0];
    console.log(`${href} | join=${join} grey=${grey} | date=${date} | ${text.split('\n').slice(0,3).join(' / ')}`);
  }
}
await browser.close();
