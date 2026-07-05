import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PNG = path.resolve(__dirname, '6b-test.png');
const EVENT = '/events/1af4d505-d667-4ef6-933f-0d29764b3655/discussion';
const BASE = 'http://127.0.0.1:3000';
const consoleLogs = [];

async function login(page, email, pass) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Password', exact: true }).click();
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(pass);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForFunction(() => !window.location.pathname.endsWith('/login'), { timeout: 45000 });
}

async function signOut(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(async () => {
    const keys = Object.keys(localStorage).filter(k => k.includes('supabase') || k.includes('sb-'));
    keys.forEach(k => localStorage.removeItem(k));
  });
}

function galleryCard(page) {
  return page.locator('.card-elevated.rounded-2xl.p-4.mb-4').filter({ has: page.getByRole('button', { name: 'Add photos' }) });
}

async function closeOverlays(page) {
  for (let i = 0; i < 3; i++) {
    const lb = page.locator('.fixed.inset-0.z-\\[60\\]');
    if (await lb.count()) {
      await lb.locator('button').last().click().catch(() => page.keyboard.press('Escape'));
      await page.waitForTimeout(400);
    }
    const modal = page.locator('.fixed.inset-0.z-50');
    if (await modal.count()) {
      await modal.getByRole('button').first().click().catch(() => page.keyboard.press('Escape'));
      await page.waitForTimeout(400);
    }
  }
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on('console', m => consoleLogs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', e => consoleLogs.push(`[pageerror] ${e.message}`));

  await login(page, 'adam@cltbucketlist.com', 'ZiggyandPuck22!');
  await page.goto(`${BASE}${EVENT}`, { waitUntil: 'networkidle' });
  await page.getByPlaceholder(/Share something/).waitFor({ timeout: 30000 });

  // Step 1 re-check on current state (may have photos from prior run)
  const card = galleryCard(page);
  const h3 = await card.locator('h3').first().textContent();
  console.log('STEP 1 recheck:', { h3, addPhotos: await card.getByRole('button', { name: 'Add photos' }).isVisible() });

  // Step 4-7 clean run
  await closeOverlays(page);
  await card.locator('button.flex.gap-2').click();
  const modalTitle = page.locator('h3.text-sm.font-bold').filter({ hasText: /^Gallery · \d+$/ });
  await modalTitle.waitFor({ timeout: 5000 });
  const modalCount = await page.locator('.grid.grid-cols-3 button.aspect-square, .grid.sm\\:grid-cols-4 button.aspect-square').count();
  console.log('STEP 4:', modalCount >= 1 ? 'PASS' : 'FAIL', `modalThumbs=${modalCount}, title=${await modalTitle.textContent()}`);

  await page.locator('.grid.grid-cols-3 button.aspect-square, .grid.sm\\:grid-cols-4 button.aspect-square').first().click();
  await page.getByRole('button', { name: 'Download' }).waitFor();
  const lb = page.locator('.fixed.inset-0.z-\\[60\\]');
  await lb.locator('button.absolute.right-2').click();
  await page.waitForTimeout(300);
  await lb.locator('button.absolute.left-2').click();
  console.log('STEP 5: PASS nav works');

  const dlErrStart = consoleLogs.length;
  let step6 = 'FAIL';
  try {
    const dl = page.waitForEvent('download', { timeout: 8000 });
    await page.getByRole('button', { name: 'Download' }).click();
    const d = await dl;
    step6 = `PASS filename=${d.suggestedFilename()}`;
  } catch (e) {
    step6 = `FAIL ${e.message.split('\n')[0]}`;
  }
  const dlErrs = consoleLogs.slice(dlErrStart).filter(l => /CSP|CORS|Refused/i.test(l));
  console.log('STEP 6:', step6, `cspErrs=${dlErrs.length}`);
  dlErrs.forEach(e => console.log(' ', e));

  const countBefore = parseInt((await modalTitle.textContent()).match(/\d+/)[0], 10);
  await page.getByRole('button', { name: 'Remove' }).click();
  await page.getByText(/Photo removed/i).waitFor({ timeout: 10000 });
  await page.waitForTimeout(1000);
  const lbGone = (await lb.count()) === 0;
  await closeOverlays(page);
  const h3after = await card.locator('h3').first().textContent();
  const countAfter = h3after.match(/(\d+)/) ? parseInt(h3after.match(/(\d+)/)[1], 10) : 0;
  console.log('STEP 7:', countAfter === countBefore - 1 && lbGone ? 'PASS' : 'FAIL', `${countBefore}->${countAfter}, lbClosed=${lbGone}`);

  await page.reload({ waitUntil: 'networkidle' });
  await page.getByPlaceholder(/Share something/).waitFor();
  const h3reload = await galleryCard(page).locator('h3').first().textContent();
  console.log('STEP 8:', h3reload.includes(String(countAfter)) ? 'PASS' : 'FAIL', `after reload: ${h3reload}`);

  // Step 9 mobile
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE}${EVENT}`, { waitUntil: 'networkidle' });
  await page.getByPlaceholder(/Share something/).waitFor();
  const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
  const gc = galleryCard(page);
  await gc.locator('button.flex.gap-2').click();
  await page.locator('h3.text-sm.font-bold').filter({ hasText: /^Gallery · \d+$/ }).waitFor();
  await page.locator('.grid.grid-cols-3 button.aspect-square').first().click();
  const dl = page.getByRole('button', { name: 'Download' });
  await dl.waitFor();
  const box = await dl.boundingBox();
  console.log('STEP 9:', scrollW <= 400 && box?.height >= 28 ? 'PASS' : 'FAIL', `scrollW=${scrollW}, dlH=${box?.height}`);

  // Step 10 regression
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${BASE}${EVENT}`, { waitUntil: 'networkidle' });
  await page.getByPlaceholder(/Share something/).waitFor();
  const ta = page.locator('textarea[placeholder*="Share something"]');
  await ta.fill('6c regression');
  await page.getByRole('button', { name: /^Post$/i }).last().click();
  await page.getByText('6c regression', { exact: true }).waitFor({ timeout: 30000 });
  const post = page.locator('.space-y-3\\.5 > .card-elevated').filter({ hasText: '6c regression' });
  await post.getByRole('button', { name: /Like/i }).click();
  await page.waitForTimeout(800);
  const liked = await post.locator('.fill-rose-500').count() > 0;
  await post.getByPlaceholder(/Write a comment/).fill('6c comment');
  await post.getByRole('button', { name: 'Comment' }).click();
  await post.getByText('6c comment').waitFor({ timeout: 15000 });
  const gBefore = await galleryCard(page).locator('h3').first().textContent();
  const nBefore = gBefore.match(/(\d+)/) ? parseInt(gBefore.match(/(\d+)/)[1], 10) : 0;
  await page.getByRole('button', { name: /Photo\/Video/i }).click();
  await page.locator('input[type="file"]').first().setInputFiles(PNG);
  await ta.fill('6c composer image');
  await page.getByRole('button', { name: /^Post$/i }).last().click();
  await page.getByText('6c composer image').waitFor({ timeout: 30000 });
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByPlaceholder(/Share something/).waitFor();
  const gAfter = await galleryCard(page).locator('h3').first().textContent();
  const nAfter = gAfter.match(/(\d+)/) ? parseInt(gAfter.match(/(\d+)/)[1], 10) : 0;
  console.log('STEP 10:', liked && nAfter === nBefore + 1 ? 'PASS' : 'FAIL', `like=${liked}, gallery ${nBefore}->${nAfter} (after reload)`);

  // RLS
  await signOut(page);
  await login(page, 'socialtest@704collective.com', 'Test1234!');
  await page.goto(`${BASE}${EVENT}`, { waitUntil: 'networkidle' });
  const lock = await page.getByText(/This discussion is for members going to/).isVisible({ timeout: 15000 });
  const noAdd = (await page.getByRole('button', { name: 'Add photos' }).count()) === 0;
  const noComp = (await page.getByPlaceholder(/Share something/).count()) === 0;
  const noPosts = (await page.locator('.space-y-3\\.5 > .card-elevated').count()) === 0;
  console.log('RLS:', lock && noAdd && noComp && noPosts ? 'PASS' : 'FAIL', { lock, noAdd, noComp, noPosts });

  console.log('\nALL CONSOLE ERRORS:');
  consoleLogs.filter(l => /error|CSP|CORS|Refused|pageerror/i.test(l)).forEach(l => console.log(l));

  await browser.close();
})();
