import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PNG = path.resolve(__dirname, '6b-test.png');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const logs = [];
  page.on('console', m => logs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', e => logs.push(`[pageerror] ${e.message}`));

  await page.goto('http://127.0.0.1:3000/login', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Password', exact: true }).click();
  await page.locator('#email').fill('adam@cltbucketlist.com');
  await page.locator('#password').fill('ZiggyandPuck22!');
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForTimeout(4000);
  await page.goto('http://127.0.0.1:3000/events/1af4d505-d667-4ef6-933f-0d29764b3655/discussion', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);

  const texts = await page.locator('.space-y-3\\.5 .card-elevated p.whitespace-pre-wrap').allTextContents();
  console.log('EXISTING POSTS:', texts);
  console.log('GALLERY:', await page.getByText(/Gallery/).textContent().catch(() => 'none'));

  await page.locator('input[type="file"]').setInputFiles(PNG);
  await page.waitForTimeout(500);
  await page.getByPlaceholder(/Share something/).fill('6b retest image upload');
  const fnResp = page.waitForResponse(r => r.url().includes('discussion-media-upload'), { timeout: 30000 });
  await page.getByRole('button', { name: /^Post$/i }).last().click();
  const presign = await fnResp.catch(() => null);
  console.log('PRESIGN status:', presign?.status(), presign ? await presign.json().catch(() => 'parse err') : 'none');
  await page.waitForTimeout(15000);

  const composerVal = await page.getByPlaceholder(/Share something/).inputValue();
  const pending = await page.locator('button[aria-label="Remove file"]').count();
  const toast = await page.locator('[data-sonner-toast]').allTextContents().catch(() => []);
  console.log('composer after:', composerVal, 'pending:', pending, 'toasts:', toast);
  console.log('post visible:', await page.getByText('6b retest image upload').isVisible());

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  console.log('after reload:', await page.getByText('6b retest image upload').isVisible());
  console.log('mobile test after reload:', await page.getByText('6b mobile test').isVisible());
  console.log('LOGS:', logs.slice(-20));

  await browser.close();
})();
