import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto('http://127.0.0.1:3000/login');
await page.getByRole('button', { name: 'Password', exact: true }).click();
await page.locator('#email').fill('adam@cltbucketlist.com');
await page.locator('#password').fill('ZiggyandPuck22!');
await page.getByRole('button', { name: /sign in/i }).click();
await page.waitForFunction(() => !window.location.pathname.endsWith('/login'), { timeout: 45000 });
await page.goto('http://127.0.0.1:3000/events/1af4d505-d667-4ef6-933f-0d29764b3655/discussion', { waitUntil: 'networkidle' });

const ta = page.locator('textarea[placeholder*="Share something"]');
await ta.fill('6c regression');
await page.getByRole('button', { name: /^Post$/i }).last().click();
await page.waitForFunction(() => {
  const t = document.querySelector('textarea[placeholder*="Share something"]');
  return t && t.value === '';
}, { timeout: 30000 });

const html = await page.locator('.space-y-3\\.5').innerHTML().catch(() => 'none');
console.log('feed html snippet:', html.slice(0, 800));
console.log('textarea value:', await ta.inputValue());
console.log('getByText count:', await page.getByText('6c regression', { exact: true }).count());
const locs = await page.getByText('6c regression', { exact: true }).all();
for (const l of locs) {
  console.log('tag:', await l.evaluate(el => `${el.tagName}.${el.className}`));
}

await browser.close();
