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
await page.waitForTimeout(3000);
const texts = await page.locator('.space-y-3\\.5 > .card-elevated p.whitespace-pre-wrap').allTextContents();
console.log('posts:', texts);
console.log('like btns:', await page.locator('button[aria-label*="Like"]').count());
console.log('6c regression visible:', await page.getByText('6c regression').count());
await browser.close();
