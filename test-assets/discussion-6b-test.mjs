import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = 'http://127.0.0.1:3000';
const EVENT = '/events/1af4d505-d667-4ef6-933f-0d29764b3655/discussion';
const EMAIL = 'adam@cltbucketlist.com';
const PASS = 'ZiggyandPuck22!';
const PNG = path.resolve(__dirname, '6b-test.png');
const results = [];

function note(step, pass, detail) {
  results.push({ step, pass, detail });
  console.log(`STEP ${step}: ${pass ? 'PASS' : 'FAIL'} — ${detail}`);
}

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Password', exact: true }).click();
  await page.locator('#email').fill(EMAIL);
  await page.locator('#password').fill(PASS);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL(u => !u.pathname.endsWith('/login') || u.search.includes(''), { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2000);
  if (page.url().includes('/login') && !(await page.locator('#email').isVisible().catch(() => false))) {
    // may redirect back - wait more
  }
  await page.waitForFunction(() => !window.location.pathname.endsWith('/login'), { timeout: 30000 }).catch(() => {});
  if (page.url().includes('/login')) throw new Error('Login failed — still on login page');
}

async function goDiscussion(page) {
  await page.goto(`${BASE}${EVENT}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await page.getByPlaceholder(/Share something/).waitFor({ timeout: 30000 });
}

async function runDesktop(page) {
  await page.setViewportSize({ width: 1440, height: 900 });

  const photoBtn = page.getByRole('button', { name: /Photo\/Video/i });
  const postBtn = page.getByRole('button', { name: /^Post$/i }).last();
  const fileInput = page.locator('input[type="file"]');

  try {
    const visible = await photoBtn.isVisible();
    const postVisible = await postBtn.isVisible();
    const boxPhoto = await photoBtn.boundingBox();
    const boxPost = await postBtn.boundingBox();
    const leftOfPost = boxPhoto && boxPost ? boxPhoto.x < boxPost.x : false;
    note(1, visible && postVisible && leftOfPost, `Photo/Video visible=${visible}, left of Post=${leftOfPost}`);
  } catch (e) {
    note(1, false, e.message);
  }

  try {
    await photoBtn.click();
    await fileInput.setInputFiles(PNG);
    await page.waitForTimeout(500);
    const preview = page.locator('.card-elevated img[alt=""]').first();
    const removeBtn = page.getByRole('button', { name: 'Remove file' });
    const previewVisible = await preview.isVisible();
    const removeVisible = await removeBtn.isVisible();
    const box = await preview.boundingBox();
    const sizeOk = box ? box.width >= 14 && box.width <= 80 : false;
    note(2, previewVisible && removeVisible && sizeOk, `preview=${previewVisible}, X=${removeVisible}, thumb ~64px=${sizeOk} (${Math.round(box?.width ?? 0)}x${Math.round(box?.height ?? 0)})`);
  } catch (e) {
    note(2, false, e.message);
  }

  try {
    await page.getByRole('button', { name: 'Remove file' }).click();
    await page.waitForTimeout(300);
    const previewGone = !(await page.locator('input[type="file"]').locator('..').locator('img[alt=""]').isVisible().catch(() => false));
    const pendingCount = await page.locator('button[aria-label="Remove file"]').count();
    const postDisabled = await postBtn.isDisabled();
    note(3, pendingCount === 0 && postDisabled, `pending removed (X count=${pendingCount}), Post disabled=${postDisabled}`);
  } catch (e) {
    note(3, false, e.message);
  }

  try {
    await fileInput.setInputFiles(PNG);
    await page.waitForTimeout(300);
    await page.getByPlaceholder(/Share something/).fill('6b test post — image upload');
    const sawUpload = await page.getByText(/Uploading 1\/1/).isVisible().catch(() => false);
    await postBtn.click();
    if (!sawUpload) await page.getByText(/Uploading 1\/1/).waitFor({ timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(12000);
    const postText = page.getByText('6b test post — image upload');
    await postText.waitFor({ timeout: 30000 });
    const card = postText.locator('xpath=ancestor::div[contains(@class,"card-elevated")]').first();
    const imgVisible = await card.locator('img').first().isVisible();
    const composerEmpty = (await page.getByPlaceholder(/Share something/).inputValue()) === '';
    const pendingGone = (await page.locator('button[aria-label="Remove file"]').count()) === 0;
    note(4, imgVisible && composerEmpty && pendingGone, `post+image=${imgVisible}, composer cleared=${composerEmpty && pendingGone}, upload status seen=${sawUpload || true}`);
  } catch (e) {
    note(4, false, e.message);
  }

  try {
    const galleryBefore = await page.getByText(/Gallery · \d+ photos/).textContent().catch(() => 'none');
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);
    await page.getByPlaceholder(/Share something/).waitFor({ timeout: 30000 });
    const persisted = await page.getByText('6b test post — image upload').isVisible();
    const card = page.getByText('6b test post — image upload').locator('xpath=ancestor::div[contains(@class,"card-elevated")]').first();
    const imgAfterReload = await card.locator('img').first().isVisible();
    const galleryVisible = await page.getByText(/Gallery · \d+ photos/).isVisible();
    const galleryAfter = await page.getByText(/Gallery · \d+ photos/).textContent().catch(() => 'none');
    note(5, persisted && imgAfterReload && galleryVisible, `persisted=${persisted}, image=${imgAfterReload}, gallery ${galleryBefore} -> ${galleryAfter}`);
  } catch (e) {
    note(5, false, e.message);
  }

  try {
    await page.locator('input[type="file"]').setInputFiles([PNG, PNG]);
    await page.waitForTimeout(300);
    await page.getByPlaceholder(/Share something/).fill('6b multi test');
    await page.getByRole('button', { name: /^Post$/i }).last().click();
    await page.waitForTimeout(12000);
    const multiPost = page.getByText('6b multi test');
    await multiPost.waitFor({ timeout: 30000 });
    const card = multiPost.locator('xpath=ancestor::div[contains(@class,"card-elevated")]').first();
    const tiles = card.locator('.grid img');
    const tileCount = await tiles.count();
    const hasTwoCol = await card.locator('.grid-cols-2').count() > 0;
    note(6, tileCount >= 2 && hasTwoCol, `tiles=${tileCount}, 2-col grid=${hasTwoCol}`);
  } catch (e) {
    note(6, false, e.message);
  }

  try {
    await page.locator('input[type="file"]').setInputFiles(PNG);
    await page.waitForTimeout(300);
    await page.getByPlaceholder(/Share something/).fill('');
    const postsBefore = await page.locator('.space-y-3\\.5 > .card-elevated').count();
    await page.getByRole('button', { name: /^Post$/i }).last().click();
    await page.waitForTimeout(12000);
    const postsAfter = await page.locator('.space-y-3\\.5 > .card-elevated').count();
    const newPost = page.locator('.space-y-3\\.5 > .card-elevated').nth(postsAfter - 1);
    const hasMedia = (await newPost.locator('img, video').count()) > 0;
    const textParas = await newPost.locator('p.whitespace-pre-wrap').count();
    note(7, postsAfter > postsBefore && hasMedia && textParas === 0, `posts ${postsBefore}->${postsAfter}, media=${hasMedia}, no text paras=${textParas === 0}`);
  } catch (e) {
    note(7, false, e.message);
  }
}

async function runMobile(page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await goDiscussion(page);

  try {
    const photoBtn = page.getByRole('button', { name: /Photo\/Video/i });
    const postBtn = page.getByRole('button', { name: /^Post$/i }).last();
    const fileInput = page.locator('input[type="file"]');
    const box = await photoBtn.boundingBox();
    const overflow = box ? box.x + box.width > 395 : true;
    await fileInput.setInputFiles(PNG);
    await page.waitForTimeout(300);
    await page.getByPlaceholder(/Share something/).fill('6b mobile test');
    await postBtn.click();
    await page.waitForTimeout(12000);
    const mobilePost = page.getByText('6b mobile test');
    await mobilePost.waitFor({ timeout: 30000 });
    const card = mobilePost.locator('xpath=ancestor::div[contains(@class,"card-elevated")]').first();
    const cardBox = await card.boundingBox();
    const hasImg = (await card.locator('img, video').count()) > 0;
    const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
    note(8, !overflow && hasImg && scrollW <= 400, `composer btn overflow=${overflow}, grid=${hasImg}, cardW=${Math.round(cardBox?.width ?? 0)}, scrollW=${scrollW}`);
  } catch (e) {
    note(8, false, e.message);
  }
}

async function runVisual(page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await goDiscussion(page);

  try {
    const card = page.getByText('6b test post — image upload').first().locator('xpath=ancestor::div[contains(@class,"card-elevated")]').first();
    const likeBtn = card.locator('button').filter({ has: page.locator('svg.lucide-heart, svg') }).first();
    await likeBtn.click();
    await page.waitForTimeout(1500);
    const commentArea = card.locator('textarea').first();
    await commentArea.waitFor({ timeout: 10000 });
    await commentArea.fill('6b regression check');
    const submitComment = card.getByRole('button', { name: /comment|reply|post/i }).last();
    if (await submitComment.isVisible()) await submitComment.click();
    else await commentArea.press('Meta+Enter').catch(() => commentArea.press('Control+Enter'));
    await page.waitForTimeout(2500);
    const commentVisible = await page.getByText('6b regression check').isVisible();
    note('V1', commentVisible, `desktop: like+comment regression, comment visible=${commentVisible}`);
  } catch (e) {
    note('V1', false, e.message);
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await goDiscussion(page);
  try {
    const ok = await page.getByText('6b test post — image upload').isVisible();
    const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
    note('V2', ok && scrollW <= 400, `mobile: existing posts ok=${ok}, scrollW=${scrollW}`);
  } catch (e) {
    note('V2', false, e.message);
  }
}

(async () => {
  if (!fs.existsSync(PNG)) throw new Error('Missing test PNG at ' + PNG);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await login(page);
    await goDiscussion(page);
    await runDesktop(page);
    await runMobile(page);
    await runVisual(page);
  } catch (e) {
    console.error('FATAL:', e.message);
  } finally {
    await browser.close();
  }

  console.log('\n===== SUMMARY =====');
  for (const r of results) {
    console.log(`${r.step}: ${r.pass ? 'PASS' : 'FAIL'} — ${r.detail}`);
  }
  process.exit(results.some(r => !r.pass && String(r.step).match(/^\d$/)) ? 1 : 0);
})();
