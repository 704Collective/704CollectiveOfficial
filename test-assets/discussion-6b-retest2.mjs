import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PNG = path.resolve(__dirname, '6b-test.png');
const EVENT = '/events/1af4d505-d667-4ef6-933f-0d29764b3655/discussion';
const EMAIL = 'adam@cltbucketlist.com';
const PASS = 'ZiggyandPuck22!';
const consoleLogs = [];
const R = [];

function log(step, pass, detail) {
  R.push({ step, pass, detail });
  console.log(`STEP ${step}: ${pass ? 'PASS' : 'FAIL'} — ${detail}`);
}

function corsCspErrors() {
  return consoleLogs.filter(l =>
    /Content Security Policy|cloudflarestorage|r2\.dev|CORS policy|Refused to connect|violates the following|Access to fetch at.*r2/i.test(l)
  );
}

async function login(page, base) {
  await page.goto(`${base}/login`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Password', exact: true }).click();
  await page.locator('#email').fill(EMAIL);
  await page.locator('#password').fill(PASS);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForFunction(() => !window.location.pathname.endsWith('/login'), { timeout: 45000 });
}

async function openDiscussion(page, base) {
  await page.goto(`${base}${EVENT}`, { waitUntil: 'networkidle' });
  await page.getByPlaceholder(/Share something/).waitFor({ timeout: 30000 });
}

function feedPost(page, text) {
  return page.locator('.space-y-3\\.5 > .card-elevated').filter({ has: page.getByText(text, { exact: true }) });
}

async function waitComposerClear(page) {
  await page.waitForFunction(() => {
    const ta = document.querySelector('textarea[placeholder*="Share something"]');
    const pending = document.querySelectorAll('button[aria-label="Remove file"]').length;
    return ta && ta.value === '' && pending === 0;
  }, { timeout: 45000 });
}

async function runLocal(page) {
  const BASE = 'http://127.0.0.1:3000';
  await login(page, BASE);
  await openDiscussion(page, BASE);
  await page.setViewportSize({ width: 1440, height: 900 });

  const fileInput = page.locator('input[type="file"]');
  const postBtn = page.getByRole('button', { name: /^Post$/i }).last();

  // STEP 4
  try {
    const startErr = corsCspErrors().length;
    await fileInput.setInputFiles(PNG);
    await page.getByPlaceholder(/Share something/).fill('6b test post — image upload');
    const putPromise = page.waitForResponse(r => r.url().includes('r2.cloudflarestorage.com') && r.request().method() === 'PUT', { timeout: 30000 });
    await postBtn.click();
    const putResp = await putPromise;
    await page.getByText(/Uploading 1\/1/).waitFor({ timeout: 15000 }).catch(() => {});
    await waitComposerClear(page);
    const card = feedPost(page, '6b test post — image upload');
    await card.waitFor({ timeout: 30000 });
    const imgs = await card.locator('.grid img').count();
    const newErrs = corsCspErrors().slice(startErr);
    log(4, putResp.ok() && imgs >= 1 && newErrs.length === 0,
      `PUT status=${putResp.status()}, grid imgs=${imgs}, composer cleared, console errors=${newErrs.length}`);
  } catch (e) {
    log(4, false, `${e.message}; errors: ${corsCspErrors().slice(-2).join(' | ')}`);
  }

  // STEP 5
  try {
    const galleryBefore = await page.getByText(/Gallery · \d+ photos/).textContent().catch(() => 'none');
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(2500);
    const card = feedPost(page, '6b test post — image upload');
    const ok = (await card.count()) === 1 && await card.locator('.grid img').first().isVisible();
    const gallery = await page.getByText(/Gallery · \d+ photos/).isVisible();
    const galleryAfter = await page.getByText(/Gallery · \d+ photos/).textContent().catch(() => 'none');
    const galleryHasImg = gallery && (await page.locator('text=Gallery').locator('..').locator('img').count()) > 0;
    log(5, ok && gallery && galleryHasImg, `persisted+image=${ok}, gallery ${galleryBefore}->${galleryAfter}, strip has img=${galleryHasImg}`);
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
    const before = await page.locator('.space-y-3\\.5 > .card-elevated').count();
    await fileInput.setInputFiles(PNG);
    await page.getByPlaceholder(/Share something/).fill('');
    await postBtn.click();
    await waitComposerClear(page);
    await page.waitForTimeout(2000);
    const after = await page.locator('.space-y-3\\.5 > .card-elevated').count();
    const newCard = page.locator('.space-y-3\\.5 > .card-elevated').nth(after - 1);
    const hasMedia = (await newCard.locator('.grid img, .grid video').count()) > 0;
    const textParas = await newCard.locator('p.whitespace-pre-wrap').count();
    log(7, after > before && hasMedia && textParas === 0, `count ${before}->${after}, media=${hasMedia}, no text=${textParas === 0}`);
  } catch (e) {
    log(7, false, e.message);
  }

  // STEP 8
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await openDiscussion(page, BASE);
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
}

async function runProd(page) {
  const PROD = 'https://704collective.com';
  const resp = await page.goto(`${PROD}${EVENT}`, { waitUntil: 'domcontentloaded' });
  const csp = resp?.headers()['content-security-policy'] || '';
  const hasR2 = csp.includes('r2.cloudflarestorage.com');
  if (!hasR2) {
    log('PROD', false, `SKIP — CSP missing r2.cloudflarestorage.com. Header snippet: ${csp.slice(0, 120)}...`);
    return;
  }
  log('PROD-CSP', true, 'CSP includes r2.cloudflarestorage.com');

  await login(page, PROD);
  await openDiscussion(page, PROD);
  await page.setViewportSize({ width: 1440, height: 900 });
  const startErr = corsCspErrors().length;
  try {
    await page.locator('input[type="file"]').setInputFiles(PNG);
    await page.getByPlaceholder(/Share something/).fill('6b prod test');
    const putPromise = page.waitForResponse(r => r.url().includes('r2.cloudflarestorage.com') && r.request().method() === 'PUT', { timeout: 30000 });
    await page.getByRole('button', { name: /^Post$/i }).last().click();
    const putResp = await putPromise;
    await waitComposerClear(page);
    const card = feedPost(page, '6b prod test');
    await card.waitFor({ timeout: 30000 });
    const imgs = await card.locator('.grid img').count();
    const newErrs = corsCspErrors().slice(startErr);
    log('PROD', putResp.ok() && imgs >= 1 && newErrs.length === 0,
      `PUT status=${putResp.status()}, imgs=${imgs}, errors=${newErrs.length}`);
  } catch (e) {
    log('PROD', false, `${e.message}; errors: ${corsCspErrors().slice(startErr).join(' | ')}`);
  }
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.on('console', m => consoleLogs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', e => consoleLogs.push(`[pageerror] ${e.message}`));

  await runLocal(page);
  await runProd(page);

  const errs = corsCspErrors();
  console.log('\n===== CONSOLE CORS/CSP/R2 =====');
  if (errs.length === 0) console.log('(none)');
  else errs.forEach(l => console.log(l));

  console.log('\n===== SUMMARY =====');
  for (const r of R) console.log(`${r.step}: ${r.pass ? 'PASS' : 'FAIL'} — ${r.detail}`);

  await browser.close();
  process.exit(R.some(x => !x.pass && !String(x.step).includes('SKIP')) ? 1 : 0);
})();
