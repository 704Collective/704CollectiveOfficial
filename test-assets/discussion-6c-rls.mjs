import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:3000';
const EVENT = '/events/1af4d505-d667-4ef6-933f-0d29764b3655/discussion';

async function login(page, email, pass) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Password', exact: true }).click({ timeout: 15000 });
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(pass);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForFunction(() => !window.location.pathname.endsWith('/login'), { timeout: 45000 });
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

// Log in as socialtest directly (fresh session)
await login(page, 'socialtest@704collective.com', 'Test1234!');
await page.goto(`${BASE}${EVENT}`, { waitUntil: 'networkidle' });

const lock = await page.getByText(/This discussion is for members going to/).isVisible({ timeout: 15000 });
const noAdd = (await page.getByRole('button', { name: 'Add photos' }).count()) === 0;
const noComp = (await page.getByPlaceholder(/Share something/).count()) === 0;
const noPosts = (await page.locator('.space-y-3\\.5 > .card-elevated').count()) === 0;
const url = page.url();
console.log('RLS:', lock && noAdd && noComp && noPosts ? 'PASS' : 'FAIL');
console.log({ lock, noAdd, noComp, noPosts, url });

await browser.close();
