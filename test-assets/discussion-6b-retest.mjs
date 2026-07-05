import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = 'http://127.0.0.1:3000';
const EVENT = '/events/1af4d505-d667-4ef6-933f-0d29764b3655/discussion';
const PNG = path.resolve(__dirname, '6b-test.png');
const consoleLogs = [];
const R = [];

function log(step, pass, detail) {
  R.push({ step, pass, detail });
  console.log(`STEP ${step}: ${pass ? 'PASS' : 'FAIL'} — ${detail}`);
}

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

function feedPost(page, text) {
  return page.locator('.space-y-3\\.5 > .card-elevated').filter({ has: page.getByText(text, { exact: true }) });
}

async function waitComposerClear(page) {
  await page.waitForFunction(() => {
    const ta = document.querySelector('textarea[placeholder*="Share something"]');
    const pending = document.querySelectorAll('button[aria-label="Remove file"]').length;
    return ta && (ta).value === '' && pending === 0;
  }, { timeout: 30000 });
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.on('console', m => consoleLogs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', e => consoleLogs.push(`[pageerror] ${e.message}`));

  await login(page);
  await openDiscussion(page);
  await page.setViewportSize({ width: 1440, height: 900 });

  const fileInput = page.locator('input[type="file"]');
  const postBtn = page.getByRole('button', { name: /^Post$/i }).last();

  // STEP 4
  try {
    consoleLogs.length = 0;
    await fileInput.setInputFiles(PNG);
    await page.getByPlaceholder(/Share something/).fill('6b test post — image upload');
    await postBtn.click();
    await page.getByText(/Uploading 1\/1/).waitFor({ timeout: 15000 }).catch(() => {});
    await waitComposerClear(page);
    const card = feedPost(page, '6b test post — image upload');
    await card.waitFor({ timeout: 30000 });
    const imgCount = await card.locator('.grid img').count();
    const cspHits = consoleLogs.filter(l => l.includes('Content Security Policy') || l.includes('cloudflarestorage') || l.includes('r2.dev'));
    log(4, imgCount >= 1 && cspHits.length === 0, `grid imgs=${imgCount}, composer cleared, CSP violations=${cspHits.length}`);
  } catch (e) {
    const cspHits = consoleLogs.filter(l => l.includes('Content Security Policy') || l.includes('cloudflarestorage'));
    log(4, false, `${e.message}; CSP hits: ${cspHits.join(' | ') || 'none'}`);
  }

  // STEP 5
  try {
    const galleryBefore = await page.getByText(/Gallery · \d+ photos/).textContent().catch(() => null);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(2500);
    const card = feedPost(page, '6b test post — image upload');
    const persisted = await card.count();
    const img = await card.locator('.grid img').first().isVisible();
    const galleryVisible = await page.getByText(/Gallery · \d+ photos/).isVisible();
    const galleryAfter = await page.getByText(/Gallery · \d+ photos/).textContent().catch(() => null);
    log(5, persisted === 1 && img && galleryVisible, `persisted=${persisted === 1}, image=${img}, gallery ${galleryBefore} -> ${galleryAfter}`);
  } catch (e) {
    log(5, false, e.message);
  }

  // STEP 6
  try {
    await fileInput.setInputFiles([PNG, PNG]);
    await page.getByPlaceholder(/Share something/).fill('6b multi test');
    await postBtn.click();
    await waitComposerClear(page);
    const card = feedPost(page, '6b multi test');
    await card.waitFor({ timeout: 30000 });
    const tiles = await card.locator('.grid img').count();
    const twoCol = await card.locator('.grid-cols-2').count();
    log(6, tiles >= 2 && twoCol >= 1, `tiles=${tiles}, grid-cols-2=${twoCol >= 1}`);
  } catch (e) {
    log(6, false, e.message);
  }

  // STEP 7
  try {
    const countBefore = await page.locator('.space-y-3\\.5 > .card-elevated').count();
    await fileInput.setInputFiles(PNG);
    await page.getByPlaceholder(/Share something/).fill('');
    await postBtn.click();
    await waitComposerClear(page);
    await page.waitForTimeout(3000);
    const countAfter = await page.locator('.space-y-3\\.5 > .card-elevated').count();
    const newCard = page.locator('.space-y-3\\.5 > .card-elevated').nth(countAfter - 1);
    const hasMedia = (await newCard.locator('.grid img, .grid video').count()) > 0;
    const textParas = await newCard.locator('p.whitespace-pre-wrap').count();
    log(7, countAfter > countBefore && hasMedia && textParas === 0, `new post media-only: count ${countBefore}->${countAfter}, media=${hasMedia}, textParas=${textParas}`);
  } catch (e) {
    log(7, false, e.message);
  }

  // STEP 8 mobile
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await openDiscussion(page);
    await fileInput.setInputFiles(PNG);
    await page.getByPlaceholder(/Share something/).fill('6b mobile test');
    await postBtn.click();
    await waitComposerClear(page);
    const card = feedPost(page, '6b mobile test');
    await card.waitFor({ timeout: 30000 });
    const hasImg = (await card.locator('.grid img').count()) > 0;
    const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
    log(8, hasImg && scrollW <= 400, `grid=${hasImg}, scrollW=${scrollW}`);
  } catch (e) {
    log(8, false, e.message);
  }

  const cspAll = consoleLogs.filter(l =>
    /Content Security Policy|cloudflarestorage|r2\.dev|Refused to connect|violates the following/i.test(l)
  );
  console.log('\n===== CONSOLE CSP/R2 =====');
  if (cspAll.length === 0) console.log('(none)');
  else cspAll.forEach(l => console.log(l));

  console.log('\n===== SUMMARY =====');
  for (const r of R) console.log(`${r.step}: ${r.pass ? 'PASS' : 'FAIL'} — ${r.detail}`);

  await browser.close();
  process.exit(R.some(x => !x.pass) ? 1 : 0);
})();
