import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:3000';
const EVENT = '/events/1af4d505-d667-4ef6-933f-0d29764b3655/discussion';

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Password', exact: true }).click();
  await page.locator('#email').fill('adam@cltbucketlist.com');
  await page.locator('#password').fill('ZiggyandPuck22!');
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForFunction(() => !window.location.pathname.endsWith('/login'), { timeout: 45000 });
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await login(page);
await page.goto(`${BASE}${EVENT}`, { waitUntil: 'networkidle' });
await page.waitForTimeout(3000);

const gallery = page.locator('.card-elevated').filter({ has: page.getByRole('button', { name: 'Add photos' }) });
console.log('gallery count:', await gallery.count());
console.log('h3:', await gallery.locator('h3').first().textContent());
console.log('empty text:', await gallery.getByText(/No photos yet/).count());
console.log('strip btn:', await gallery.locator('button.flex.gap-2').count());
console.log('all buttons in gallery:', await gallery.locator('button').count());

await browser.close();
