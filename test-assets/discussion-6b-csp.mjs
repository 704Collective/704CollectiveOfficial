import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PNG = path.resolve(__dirname, '6b-test.png');
const EVENT = '/events/1af4d505-d667-4ef6-933f-0d29764b3655/discussion';

async function login(page, base) {
  await page.goto(`${base}/login`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Password', exact: true }).click();
  await page.locator('#email').fill('adam@cltbucketlist.com');
  await page.locator('#password').fill('ZiggyandPuck22!');
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForFunction(() => !window.location.pathname.endsWith('/login'), { timeout: 45000 });
}

async function checkCsp(page, base) {
  await login(page, base);
  await page.goto(`${base}${EVENT}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  const csp = await page.evaluate(() => document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute('content') || 'header-only');
  let blocked = false;
  page.on('console', msg => { if (msg.text().includes('Content Security Policy') && msg.text().includes('cloudflarestorage')) blocked = true; });
  await page.locator('input[type="file"]').setInputFiles(PNG);
  await page.getByPlaceholder(/Share something/).fill('csp probe');
  await page.getByRole('button', { name: /^Post$/i }).last().click();
  await page.waitForTimeout(8000);
  const toast = await page.locator('[data-sonner-toast]').allTextContents().catch(() => []);
  const feedPost = await page.locator('.space-y-3\\.5').getByText('csp probe').count();
  return { blocked, toast, feedPost, csp: csp.slice(0, 80) };
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  for (const base of ['http://127.0.0.1:3000', 'https://704collective.com']) {
    const page = await browser.newPage();
    try {
      const r = await checkCsp(page, base);
      console.log(base, JSON.stringify(r));
    } catch (e) {
      console.log(base, 'ERR', e.message);
    }
    await page.close();
  }
  await browser.close();
})();
