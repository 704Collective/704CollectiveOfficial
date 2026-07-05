import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:3000';
const IDS = [
  '1af4d505-d667-4ef6-933f-0d29764b3655',
  '8ee37978-47f7-45ec-b573-9129a8e4a959',
  'c8e4ccdb-1eef-468b-8290-cf44fb22c34a',
];

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
for (const id of IDS) {
  await page.goto(`${BASE}/events/${id}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  const card = await page.locator('#ticket-card').innerText();
  const date = (await page.locator('body').innerText()).match(/(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday), [A-Za-z]+ \d{1,2}, \d{4}/)?.[0];
  const title = await page.locator('h1').first().textContent();
  console.log('\n===', id, title, date, '===');
  console.log(card);
}
await browser.close();
