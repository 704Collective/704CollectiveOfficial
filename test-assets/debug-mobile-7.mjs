import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:3000';
const BUSINESS_MTG = '8ee37978-47f7-45ec-b573-9129a8e4a959';

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
await page.setViewportSize({ width: 390, height: 844 });
await login(page);
await page.goto(`${BASE}/events/${BUSINESS_MTG}`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
const card = page.locator('#ticket-card');
const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
const cardBox = await card.boundingBox();
const grey = card.getByText('Discussion opens 5 days before the event');
const greyBox = await grey.boundingBox();
const stickyCount = await page.locator('.mobile-sticky-cta').count();
console.log('scrollW', scrollW, 'cardW', cardBox?.width, 'greyH', greyBox?.height, 'stickyInDom', stickyCount);
console.log('PASS mobile layout:', scrollW <= 400 && cardBox && greyBox && greyBox.height >= 28 && stickyCount === 0);
await browser.close();
