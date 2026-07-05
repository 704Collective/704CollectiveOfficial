import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PNG = path.resolve(__dirname, '6b-test.png');
const PNG2 = path.resolve(__dirname, '6b-test-copy.png');
const PNG3 = path.resolve(__dirname, '6b-test-copy2.png');
const EVENT = '/events/1af4d505-d667-4ef6-933f-0d29764b3655/discussion';
const BASE = 'http://127.0.0.1:3000';
const ADMIN = { email: 'adam@cltbucketlist.com', pass: 'ZiggyandPuck22!' };
const MEMBER = { email: 'socialtest@704collective.com', pass: 'Test1234!' };

// Copy test PNG for multi-upload (same file, different names)
for (const [src, dst] of [[PNG, PNG2], [PNG, PNG3]]) {
  if (!fs.existsSync(dst)) fs.copyFileSync(src, dst);
}

const R = [];
const consoleLogs = [];

function log(step, pass, detail) {
  R.push({ step, pass, detail });
  console.log(`STEP ${step}: ${pass ? 'PASS' : 'FAIL'} — ${detail}`);
}

function allErrors() {
  return consoleLogs.filter(l =>
    /error|failed|CORS|Content Security Policy|violates|Refused to connect|cloudflarestorage|r2\.dev/i.test(l)
  );
}

async function login(page, { email, pass }) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Password', exact: true }).click();
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(pass);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForFunction(() => !window.location.pathname.endsWith('/login'), { timeout: 45000 });
}

async function logout(page) {
  const avatar = page.locator('header button').filter({ has: page.locator('div.rounded-full, img.rounded-full') }).last();
  await avatar.click();
  await page.getByRole('menuitem', { name: /sign out/i }).click();
  await page.waitForURL(/\/(login|$)/, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1000);
}

async function openDiscussion(page) {
  await page.goto(`${BASE}${EVENT}`, { waitUntil: 'networkidle' });
  await page.getByPlaceholder(/Share something/).waitFor({ timeout: 30000 });
}

function galleryCard(page) {
  return page.locator('.card-elevated.rounded-2xl.p-4.mb-4').filter({ has: page.getByRole('button', { name: 'Add photos' }) });
}

async function galleryCount(page) {
  const h3 = galleryCard(page).locator('h3');
  const text = await h3.textContent().catch(() => '');
  const m = text.match(/Gallery(?: · (\d+))?/);
  return m && m[1] ? parseInt(m[1], 10) : 0;
}

async function waitGalleryCount(page, n, timeout = 45000) {
  await page.waitForFunction(
    (expected) => {
      const cards = [...document.querySelectorAll('.card-elevated.rounded-2xl.p-4.mb-4')];
      const card = cards.find(c => c.textContent?.includes('Add photos'));
      if (!card) return false;
      const h3 = card.querySelector('h3')?.textContent || '';
      const m = h3.match(/Gallery · (\d+)/);
      const count = m ? parseInt(m[1], 10) : 0;
      return count === expected;
    },
    n,
    { timeout }
  );
}

function feedPost(page, text) {
  return page.locator('.space-y-3\\.5 > .card-elevated').filter({ has: page.getByText(text, { exact: true }) });
}

async function uploadToGallery(page, files) {
  const card = galleryCard(page);
  const input = card.locator('input[type="file"]');
  await input.setInputFiles(files);
}

(async () => {
  const browser = await chromium.launch({ headless: true, downloadsPath: path.join(__dirname, 'downloads-6c') });
  const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.on('console', m => consoleLogs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', e => consoleLogs.push(`[pageerror] ${e.message}`));

  await login(page, ADMIN);
  await openDiscussion(page);

  // STEP 1 — empty state
  try {
    const card = galleryCard(page);
    const hasHeader = await card.getByText(/^Gallery$/).isVisible();
    const hasAdd = await card.getByRole('button', { name: 'Add photos' }).isVisible();
    const hasEmpty = await card.getByText(/No photos yet/).isVisible();
    const count = await galleryCount(page);
    log(1, hasHeader && hasAdd && hasEmpty && count === 0, `header=${hasHeader}, add=${hasAdd}, empty=${hasEmpty}, count=${count}`);
  } catch (e) { log(1, false, e.message); }

  // STEP 2 — single upload
  try {
    const startErr = allErrors().length;
    const putPromise = page.waitForResponse(r => r.url().includes('r2.cloudflarestorage.com') && r.request().method() === 'PUT', { timeout: 30000 });
    await uploadToGallery(page, PNG);
    await page.getByText(/Uploading 1\/1/).waitFor({ timeout: 15000 }).catch(() => {});
    const putResp = await putPromise;
    await page.getByText(/added to the gallery/i).waitFor({ timeout: 20000 });
    await waitGalleryCount(page, 1);
    const stripImgs = await galleryCard(page).locator('button img').count();
    const count = await galleryCount(page);
    const newErrs = allErrors().slice(startErr);
    log(2, putResp.ok() && count === 1 && stripImgs >= 1 && newErrs.length === 0,
      `PUT=${putResp.status()}, count=${count}, stripImgs=${stripImgs}, consoleErrs=${newErrs.length}`);
  } catch (e) { log(2, false, `${e.message}; errs: ${allErrors().slice(-3).join(' | ')}`); }

  // STEP 3 — add 2 more (bulk)
  try {
    await uploadToGallery(page, [PNG2, PNG3]);
    await page.getByText(/Uploading 2\/2/).waitFor({ timeout: 15000 }).catch(() => {});
    await page.getByText(/added to the gallery/i).waitFor({ timeout: 30000 });
    await waitGalleryCount(page, 3);
    const stripTiles = await galleryCard(page).locator('button > div.aspect-square').count();
    const count = await galleryCount(page);
    log(3, count === 3 && stripTiles >= 3, `count=${count}, stripTiles=${stripTiles}`);
  } catch (e) { log(3, false, e.message); }

  // STEP 4 — grid modal
  try {
    await galleryCard(page).locator('button.flex.gap-2').click();
    await page.getByRole('heading', { name: 'Gallery · 3' }).waitFor({ timeout: 5000 });
    const modalThumbs = await page.locator('.grid.grid-cols-3 button.aspect-square').count();
    log(4, modalThumbs === 3, `modalThumbs=${modalThumbs}`);
  } catch (e) { log(4, false, e.message); }

  // STEP 5 — lightbox + prev/next
  try {
    await page.locator('.grid.grid-cols-3 button.aspect-square').first().click();
    await page.getByRole('button', { name: 'Download' }).waitFor({ timeout: 5000 });
    const imgVisible = await page.locator('.fixed.inset-0.z-\\[60\\] img').isVisible();
    await page.locator('.fixed.inset-0.z-\\[60\\] button').filter({ has: page.locator('svg') }).last().click(); // next via chevron right
    // Use chevron buttons
    const lb = page.locator('.fixed.inset-0.z-\\[60\\]');
    await lb.locator('button').filter({ has: page.locator('.lucide-chevron-right, [class*="ChevronRight"]') }).click().catch(async () => {
      await lb.locator('button.absolute.right-2').click();
    });
    await page.waitForTimeout(500);
    await lb.locator('button.absolute.left-2').click();
    await page.waitForTimeout(500);
    const stillOpen = await page.getByRole('button', { name: 'Download' }).isVisible();
    log(5, imgVisible && stillOpen, `lightboxOpen=${imgVisible}, navWorks=${stillOpen}`);
  } catch (e) { log(5, false, e.message); }

  // STEP 6 — download
  try {
    const startErr = allErrors().length;
    const downloadPromise = page.waitForEvent('download', { timeout: 15000 });
    await page.getByRole('button', { name: 'Download' }).click();
    const download = await downloadPromise;
    const suggested = download.suggestedFilename();
    await download.path();
    const newErrs = allErrors().slice(startErr).filter(e => /CORS|Refused to fetch/i.test(e));
    log(6, !!suggested && newErrs.length === 0, `filename=${suggested}, corsErrs=${newErrs.length}`);
  } catch (e) { log(6, false, `${e.message}; ${allErrors().slice(-3).join(' | ')}`); }

  // STEP 7 — admin remove
  try {
    const before = await galleryCount(page);
    await page.getByRole('button', { name: 'Remove' }).click();
    await page.getByText(/Photo removed/i).waitFor({ timeout: 10000 });
    await page.waitForTimeout(1500);
    const downloadGone = !(await page.getByRole('button', { name: 'Download' }).isVisible().catch(() => false));
    await galleryCard(page).locator('button.flex.gap-2').click();
    await page.getByRole('heading', { name: 'Gallery · 2' }).waitFor({ timeout: 10000 });
    const modalThumbs = await page.locator('.grid.grid-cols-3 button.aspect-square').count();
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    const count = await galleryCount(page);
    log(7, before === 3 && count === 2 && modalThumbs === 2 && downloadGone,
      `before=${before}, after=${count}, modalThumbs=${modalThumbs}, lightboxClosed=${downloadGone}`);
  } catch (e) { log(7, false, e.message); }

  // STEP 8 — reload persistence
  try {
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByPlaceholder(/Share something/).waitFor({ timeout: 30000 });
    await waitGalleryCount(page, 2, 30000);
    const count = await galleryCount(page);
    log(8, count === 2, `count after reload=${count}`);
  } catch (e) { log(8, false, e.message); }

  // STEP 9 — mobile
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await openDiscussion(page);
    const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
    const card = galleryCard(page);
    const cardBox = await card.boundingBox();
    const noOverflow = scrollW <= 400 && cardBox && cardBox.width <= 390;
    await card.locator('button.flex.gap-2').click();
    await page.getByRole('heading', { name: /Gallery · \d+/ }).waitFor({ timeout: 5000 });
    const modalW = await page.locator('.bg-card.border.rounded-2xl.max-w-3xl').boundingBox();
    await page.locator('.grid.grid-cols-3 button.aspect-square').first().click();
    const dlBtn = page.getByRole('button', { name: 'Download' });
    await dlBtn.waitFor({ timeout: 5000 });
    const dlBox = await dlBtn.boundingBox();
    const tappable = dlBox && dlBox.height >= 28;
    await page.getByRole('button', { name: 'Download' }).press('Escape').catch(() => {});
    await page.locator('.fixed.inset-0.z-\\[60\\] button').filter({ hasText: '' }).last().click().catch(() => page.keyboard.press('Escape'));
    log(9, noOverflow && modalW && tappable, `scrollW=${scrollW}, cardW=${cardBox?.width}, modalW=${modalW?.width}, dlH=${dlBox?.height}`);
  } catch (e) { log(9, false, e.message); }

  // STEP 10 — regression (desktop)
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openDiscussion(page);
    const composerInput = page.locator('textarea[placeholder*="Share something"]');
    await composerInput.fill('6c regression');
    await page.getByRole('button', { name: /^Post$/i }).last().click();
    const post = feedPost(page, '6c regression');
    await post.waitFor({ timeout: 30000 });

    await post.getByRole('button', { name: /Like/i }).click();
    await page.waitForTimeout(1000);
    const liked = await post.locator('.fill-rose-500').count() > 0;

    await post.getByPlaceholder(/Write a comment/).fill('6c comment');
    await post.getByRole('button', { name: 'Comment' }).click();
    await post.getByText('6c comment', { exact: true }).waitFor({ timeout: 15000 });

    const galleryBefore = await galleryCount(page);
    const composerFile = page.locator('input[type="file"]').first();
    await composerFile.setInputFiles(PNG);
    await composerInput.fill('6c composer image');
    const putPromise = page.waitForResponse(r => r.url().includes('r2.cloudflarestorage.com') && r.request().method() === 'PUT', { timeout: 30000 });
    await page.getByRole('button', { name: /^Post$/i }).last().click();
    await putPromise;
    await feedPost(page, '6c composer image').waitFor({ timeout: 30000 });

    await page.waitForTimeout(2000);
    let galleryAfter = await galleryCount(page);
    let liveIncreased = galleryAfter === galleryBefore + 1;
    if (!liveIncreased) {
      await page.reload({ waitUntil: 'networkidle' });
      await page.getByPlaceholder(/Share something/).waitFor({ timeout: 30000 });
      galleryAfter = await galleryCount(page);
    }
    const persistedIncreased = galleryAfter === galleryBefore + 1;

    log(10, liked && persistedIncreased,
      `like=${liked}, comment ok, gallery ${galleryBefore}->${galleryAfter}, liveUpdate=${liveIncreased}`);
  } catch (e) { log(10, false, e.message); }

  // RLS — socialtest teaser
  try {
    await logout(page);
    await login(page, MEMBER);
    await page.goto(`${BASE}${EVENT}`, { waitUntil: 'networkidle' });
    const lockVisible = await page.getByText(/This discussion is for members going to/).isVisible({ timeout: 15000 });
    const noGallery = (await page.getByRole('button', { name: 'Add photos' }).count()) === 0;
    const noComposer = (await page.getByPlaceholder(/Share something/).count()) === 0;
    const noPosts = (await page.locator('.space-y-3\\.5 > .card-elevated').count()) === 0;
    log('RLS', lockVisible && noGallery && noComposer && noPosts,
      `lock=${lockVisible}, noGallery=${noGallery}, noComposer=${noComposer}, noPosts=${noPosts}`);
  } catch (e) { log('RLS', false, e.message); }

  console.log('\n===== CONSOLE ERRORS (verbatim) =====');
  const errs = allErrors();
  if (errs.length === 0) console.log('(none)');
  else errs.forEach(l => console.log(l));

  console.log('\n===== SUMMARY =====');
  for (const r of R) console.log(`${r.step}: ${r.pass ? 'PASS' : 'FAIL'} — ${r.detail}`);

  await browser.close();
  process.exit(R.some(x => !x.pass) ? 1 : 0);
})();
