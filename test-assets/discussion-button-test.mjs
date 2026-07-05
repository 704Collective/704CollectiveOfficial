import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:3000';
const SOUTHERN = '1af4d505-d667-4ef6-933f-0d29764b3655';
const BUSINESS_MTG = '8ee37978-47f7-45ec-b573-9129a8e4a959';
const SUPPERCLUB = 'c8e4ccdb-1eef-468b-8290-cf44fb22c34a';
const R = [];
const consoleLogs = [];

function log(step, pass, detail) {
  R.push({ step, pass, detail });
  console.log(`STEP ${step}: ${pass ? 'PASS' : 'FAIL'} — ${detail}`);
}

async function login(page, email, pass) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Password', exact: true }).click({ timeout: 15000 });
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(pass);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForFunction(() => !window.location.pathname.endsWith('/login'), { timeout: 45000 });
}

async function freshPage(browser, viewport) {
  const ctx = await browser.newContext({ viewport });
  const p = await ctx.newPage();
  p.on('console', m => consoleLogs.push(`[${m.type()}] ${m.text()}`));
  p.on('pageerror', e => consoleLogs.push(`[pageerror] ${e.message}`));
  return { ctx, page: p };
}

const browser = await chromium.launch({ headless: true });
let { ctx, page } = await freshPage(browser, { width: 1440, height: 900 });

// STATE 1 — Southern Cooking (spec event)
await login(page, 'adam@cltbucketlist.com', 'ZiggyandPuck22!');
await page.goto(`${BASE}/events/${SOUTHERN}`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
try {
  const card = page.locator('#ticket-card');
  const cardText = await card.innerText();
  const rsvpd = /You.re RSVP.d!/i.test(cardText);
  const cancel = await card.getByRole('button', { name: /Cancel RSVP/i }).isVisible().catch(() => false);
  const join = await card.getByRole('link', { name: 'Join the Discussion' }).count();
  const grey = await card.getByText('Discussion opens 5 days before the event').count();
  const waitlist = /Join the Waitlist|Event Full/i.test(cardText);
  log(1, rsvpd && cancel && join === 1 && grey === 0,
    `Southern Cooking: rsvpd=${rsvpd}, cancel=${cancel}, gold=${join}, grey=${grey}, waitlist=${waitlist} — card shows: ${cardText.split('\n').slice(0,2).join(' / ')}`);
} catch (e) { log(1, false, e.message); }

try {
  const join = page.locator('#ticket-card').getByRole('link', { name: 'Join the Discussion' });
  if (await join.count()) {
    await join.click();
    await page.waitForURL(`**/events/${SOUTHERN}/discussion`, { timeout: 15000 });
    const full = await page.getByPlaceholder(/Share something/).isVisible({ timeout: 15000 });
    log(2, full, `nav=${page.url()}, composer=${full}`);
  } else {
    // Verify discussion URL still reachable for admin (informational fallback)
    await page.goto(`${BASE}/events/${SOUTHERN}/discussion`, { waitUntil: 'networkidle' });
    const full = await page.getByPlaceholder(/Share something/).isVisible({ timeout: 15000 }).catch(() => false);
    log(2, false, `No gold button on ticket card; direct /discussion access=${full} (button click not testable)`);
  }
} catch (e) { log(2, false, e.message); }

// STATE 2 — Business Member Meeting (admin RSVP'd, July 14 > 5 days out)
try {
  await page.goto(`${BASE}/events/${BUSINESS_MTG}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  const card = page.locator('#ticket-card');
  const rsvpd = await card.getByText(/You.re RSVP.d!/i).isVisible();
  const grey = await card.getByText('Discussion opens 5 days before the event').isVisible();
  const gold = await card.getByRole('link', { name: 'Join the Discussion' }).count();
  log(3, rsvpd && grey && gold === 0,
    `event=${BUSINESS_MTG} (Business Member Meeting, July 14 2026), rsvpd=${rsvpd}, grey=${grey}, gold=${gold}`);
} catch (e) { log(3, false, e.message); }

// STATE 3 — no RSVP
try {
  await page.goto(`${BASE}/events/${SUPPERCLUB}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  const card = page.locator('#ticket-card');
  const rsvpd = await card.getByText(/You.re RSVP.d!/i).isVisible().catch(() => false);
  const join = await card.getByRole('link', { name: 'Join the Discussion' }).count();
  const grey = await card.getByText('Discussion opens 5 days before the event').count();
  log(4, !rsvpd && join === 0 && grey === 0, `SupperClub: rsvpd=${rsvpd}, join=${join}, grey=${grey}, card=waitlist/purchase`);
} catch (e) { log(4, false, e.message); }

await ctx.close();

// REGRESSION 5 — logged out SupperClub
({ ctx, page } = await freshPage(browser, { width: 1440, height: 900 }));
try {
  await page.goto(`${BASE}/events/${SUPPERCLUB}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  const card = page.locator('#ticket-card');
  const join = await card.getByRole('link', { name: 'Join the Discussion' }).count();
  const grey = await card.getByText('Discussion opens 5 days before the event').count();
  const hasState = (await card.getByText(/Event Full|Purchase|Waitlist|Sign In|RSVP/i).count()) > 0;
  log(5, join === 0 && grey === 0 && hasState, `logged-out SupperClub: purchase/waitlist=${hasState}, noDiscussion=${join + grey === 0}`);
} catch (e) { log(5, false, e.message); }
await ctx.close();

// REGRESSION 6 — socialtest
({ ctx, page } = await freshPage(browser, { width: 1440, height: 900 }));
try {
  await login(page, 'socialtest@704collective.com', 'Test1234!');
  await page.goto(`${BASE}/events/${SUPPERCLUB}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  const card = page.locator('#ticket-card');
  const rsvpd = await card.getByText(/You.re RSVP.d!/i).isVisible().catch(() => false);
  const join = await card.getByRole('link', { name: 'Join the Discussion' }).count();
  const grey = await card.getByText('Discussion opens 5 days before the event').count();
  const hasAction = (await card.getByRole('button', { name: /RSVP|Purchase|Waitlist|Sign In/i }).count()) +
    (await card.getByRole('link', { name: /Sign In|RSVP|Purchase/i }).count()) > 0;
  log(6, !rsvpd && join === 0 && grey === 0 && hasAction, `socialtest SupperClub: rsvpd=${rsvpd}, join=${join}, actions=${hasAction}`);
} catch (e) { log(6, false, e.message); }
await ctx.close();

// MOBILE 7 — Business Member Meeting (hasTicket branch UI) + Southern if possible
({ ctx, page } = await freshPage(browser, { width: 390, height: 844 }));
try {
  await login(page, 'adam@cltbucketlist.com', 'ZiggyandPuck22!');
  await page.goto(`${BASE}/events/${BUSINESS_MTG}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  const card = page.locator('#ticket-card');
  const rsvpd = await card.getByText(/You.re RSVP.d!/i).isVisible();
  const grey = await card.getByText('Discussion opens 5 days before the event');
  await grey.waitFor({ timeout: 10000 });
  const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
  const cardBox = await card.boundingBox();
  const greyBox = await grey.boundingBox();
  const stickyDisplay = await page.locator('.mobile-sticky-cta').evaluate(el => getComputedStyle(el).display);
  log(7, rsvpd && scrollW <= 400 && cardBox && greyBox && greyBox.height >= 28 && stickyDisplay === 'none',
    `390px Business Mtg hasTicket UI: scrollW=${scrollW}, cardW=${cardBox?.width?.toFixed(0)}, greyH=${greyBox?.height?.toFixed(0)}, stickyHidden=${stickyDisplay === 'none'} (gold btn N/A — discussion not open yet; grey box verified in hasTicket branch)`);
} catch (e) { log(7, false, e.message); }
await ctx.close();

console.log('\n===== DATA NOTES =====');
console.log('Southern Cooking: admin currently shows Event Full / Join Waitlist (NOT hasTicket branch) — no member_rsvp credential in UI');
console.log('STATE 2 event: 8ee37978-47f7-45ec-b573-9129a8e4a959 Business Member Meeting (existing RSVP, no new RSVP created)');

console.log('\n===== CONSOLE ERRORS (verbatim) =====');
const errs = consoleLogs.filter(l => /\[error\]|pageerror/i.test(l));
if (errs.length === 0) console.log('(none)');
else errs.forEach(l => console.log(l));

console.log('\n===== SUMMARY =====');
for (const r of R) console.log(`${r.step}: ${r.pass ? 'PASS' : 'FAIL'} — ${r.detail}`);

await browser.close();
process.exit(R.some(x => !x.pass) ? 1 : 0);
