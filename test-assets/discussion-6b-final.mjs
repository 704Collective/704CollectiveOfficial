import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = 'http://127.0.0.1:3000';
const EVENT = '/events/1af4d505-d667-4ef6-933f-0d29764b3655/discussion';
const PNG = path.resolve(__dirname, '6b-test.png');
const R = [];

function log(step, pass, detail) { R.push({ step, pass, detail }); console.log(`${step}: ${pass ? 'PASS' : 'FAIL'} — ${detail}`); }

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Password', exact: true }).click();
  await page.locator('#email').fill('adam@cltbucketlist.com');
  await page.locator('#password').fill('ZiggyandPuck22!');
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForFunction(() => !window.location.pathname.endsWith('/login'), { timeout: 45000 });
}

async function openDiscussion(page) {
  await page.goto(`${BASE}${EVENT}`, { waitUntil: 'networkidle' });
  await page.getByPlaceholder(/Share something/).waitFor({ timeout: 30000 });
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  let cspBlocked = false;
  page.on('console', m => { if (m.text().includes('cloudflarestorage') && m.text().includes('Content Security Policy')) cspBlocked = true; });

  await login(page);
  await openDiscussion(page);

  // Desktop 1440
  await page.setViewportSize({ width: 1440, height: 900 });
  const photoBtn = page.getByRole('button', { name: /Photo\/Video/i });
  const postBtn = page.getByRole('button', { name: /^Post$/i }).last();
  const fileInput = page.locator('input[type="file"]');

  const bp = await photoBtn.boundingBox();
  const bpost = await postBtn.boundingBox();
  log(1, (await photoBtn.isVisible()) && bp && bpost && bp.x < bpost.x, 'Photo/Video button visible left of Post at 1440x900');

  await photoBtn.click();
  const accept = await fileInput.getAttribute('accept');
  await fileInput.setInputFiles(PNG);
  await page.waitForTimeout(400);
  const prev = page.locator('button[aria-label="Remove file"]').locator('..').locator('img[alt=""]');
  const box = await prev.boundingBox().catch(() => null);
  log(2, !!accept && (await page.locator('button[aria-label="Remove file"]').isVisible()) && box && box.width >= 60 && box.width <= 70,
    `hidden file input accept set; thumbnail ${Math.round(box?.width ?? 0)}x${Math.round(box?.height ?? 0)} with X (native OS picker not verifiable in automation)`);

  await page.getByRole('button', { name: 'Remove file' }).click();
  log(3, (await page.locator('button[aria-label="Remove file"]').count()) === 0 && (await postBtn.isDisabled()),
    'X removes preview; Post disabled with empty text and no files');

  // Step 4-7 upload flow
  await fileInput.setInputFiles(PNG);
  await page.getByPlaceholder(/Share something/).fill('6b test post — image upload');
  let uploadStatusSeen = false;
  page.on('console', () => {});
  const statusWatcher = page.getByText(/Uploading 1\/1/).waitFor({ timeout: 20000 }).then(() => { uploadStatusSeen = true; }).catch(() => {});
  await postBtn.click();
  await statusWatcher;
  await page.waitForTimeout(6000);
  const feedHas = await page.locator('.space-y-3\\.5').getByText('6b test post — image upload').count();
  const composerCleared = (await page.getByPlaceholder(/Share something/).inputValue()) === '' && (await page.locator('button[aria-label="Remove file"]').count()) === 0;
  const toastErr = await page.locator('[data-sonner-toast]').filter({ hasText: /upload|failed|CSP/i }).first().textContent().catch(() => null);
  log(4, false, `Upload blocked by CSP=${cspBlocked}; feed post persisted in list=${feedHas > 0}; composer cleared=${composerCleared}; upload status=${uploadStatusSeen}; toast=${toastErr || 'none visible'}`);

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  const persisted = await page.locator('.space-y-3\\.5').getByText('6b test post — image upload').count();
  const gallery = await page.getByText(/Gallery ·/).isVisible().catch(() => false);
  log(5, false, `After reload: post in feed=${persisted > 0}, gallery visible=${gallery} (upload never completed)`);

  log(6, false, 'Skipped — depends on successful upload (CSP blocks R2 PUT to cloudflarestorage.com)');
  log(7, false, 'Skipped — depends on successful media-only upload (CSP blocks R2 PUT)');

  // Mobile 390
  await page.setViewportSize({ width: 390, height: 844 });
  await openDiscussion(page);
  const mPhoto = page.getByRole('button', { name: /Photo\/Video/i });
  const mPost = page.getByRole('button', { name: /^Post$/i }).last();
  const mb = await mPhoto.boundingBox();
  const scrollW0 = await page.evaluate(() => document.documentElement.scrollWidth);
  await page.locator('input[type="file"]').setInputFiles(PNG);
  await page.getByPlaceholder(/Share something/).fill('6b mobile test');
  const scrollW1 = await page.evaluate(() => document.documentElement.scrollWidth);
  log(8, mb && mb.x >= 0 && mb.x + mb.width <= 390 && scrollW0 <= 400 && scrollW1 <= 400,
    `composer layout clean at 390px (Photo/Video x=${Math.round(mb?.x ?? 0)} w=${Math.round(mb?.width ?? 0)}, scrollW ${scrollW0}/${scrollW1}); attach preview OK; post upload same CSP block expected`);

  // Visual regression on existing text posts
  await page.setViewportSize({ width: 1440, height: 900 });
  await openDiscussion(page);
  const firstPost = page.locator('.space-y-3\\.5 > .card-elevated').first();
  const likeBtn = firstPost.locator('button').first();
  await likeBtn.click();
  await page.waitForTimeout(1000);
  const ta = firstPost.locator('textarea').first();
  await ta.fill('6b regression check');
  await firstPost.getByRole('button', { name: /comment/i }).click().catch(async () => ta.press('Control+Enter'));
  await page.waitForTimeout(2500);
  const commentOk = await firstPost.getByText('6b regression check').isVisible();
  log('V-desktop', commentOk, `Like clicked; comment "6b regression check" on existing text post=${commentOk}`);

  await page.setViewportSize({ width: 390, height: 844 });
  await openDiscussion(page);
  const postsVisible = await page.locator('.space-y-3\\.5 > .card-elevated').count();
  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  log('V-mobile', postsVisible > 0 && sw <= 400, `${postsVisible} text posts visible, no horizontal overflow (scrollW=${sw})`);

  await browser.close();
  console.log('\n--- END ---');
})();
