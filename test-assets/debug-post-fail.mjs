import { chromium } from 'playwright';

const logs = [];
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
page.on('console', m => logs.push(`[${m.type()}] ${m.text()}`));
page.on('response', r => {
  if (r.url().includes('event_discussion_posts') && r.request().method() === 'POST') {
    logs.push(`POST posts status=${r.status()}`);
  }
});

await page.goto('http://127.0.0.1:3000/login');
await page.getByRole('button', { name: 'Password', exact: true }).click();
await page.locator('#email').fill('adam@cltbucketlist.com');
await page.locator('#password').fill('ZiggyandPuck22!');
await page.getByRole('button', { name: /sign in/i }).click();
await page.waitForFunction(() => !window.location.pathname.endsWith('/login'), { timeout: 45000 });
await page.goto('http://127.0.0.1:3000/events/1af4d505-d667-4ef6-933f-0d29764b3655/discussion', { waitUntil: 'networkidle' });

const ta = page.locator('textarea[placeholder*="Share something"]');
await ta.fill('6c regression test2');
const respPromise = page.waitForResponse(r => r.url().includes('event_discussion_posts'), { timeout: 15000 }).catch(() => null);
await page.getByRole('button', { name: /^Post$/i }).last().click();
const resp = await respPromise;
console.log('response:', resp ? `${resp.status()} ${resp.url()}` : 'none');
await page.waitForTimeout(3000);
console.log('textarea after:', await ta.inputValue());
console.log('toast visible:', await page.locator('[data-sonner-toast]').allTextContents());
console.log('posts in feed:', await page.locator('.space-y-3\\.5 > .card-elevated').count());
console.log('logs:', logs.filter(l => /POST|error|toast/i.test(l)));

await browser.close();
