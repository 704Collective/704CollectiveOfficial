import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const GOOGLE_FONT_HOST = /fonts\.googleapis\.com|fonts\.gstatic\.com/;
const PROD = "https://704collective.com";
const SHOT_DIR = path.join("test-results", "fonts");
const SAMPLE_EVENT = "/events/0450e353-7c2c-4455-a42a-d697ce836ab1";

async function assertNoGoogleFonts(page: Page, pathName: string) {
  const hits: string[] = [];
  page.on("request", (req) => {
    if (GOOGLE_FONT_HOST.test(req.url())) hits.push(req.url());
  });
  await page.goto(pathName, { waitUntil: "load" });
  expect(hits, `Google Fonts requested on ${pathName}: ${hits.join(", ")}`).toEqual([]);
}

async function shot(page: Page, project: string, label: string, phase: "before" | "after") {
  const dir = path.join(SHOT_DIR, phase, project);
  fs.mkdirSync(dir, { recursive: true });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(dir, `${label}.png`), fullPage: false });
}

async function ready(page: Page, marker: RegExp | string) {
  await expect(page.locator("body")).toContainText(marker, { timeout: 20_000 });
}

test.describe("small-batch fonts + ambassador oauth message", () => {
  test("home does not request Google Fonts", async ({ page }) => {
    await assertNoGoogleFonts(page, "/");
  });

  test("login does not request Google Fonts", async ({ page }) => {
    await assertNoGoogleFonts(page, "/login");
  });

  test("join does not request Google Fonts", async ({ page }) => {
    await assertNoGoogleFonts(page, "/join");
  });

  test("events does not request Google Fonts", async ({ page }) => {
    await assertNoGoogleFonts(page, "/events");
  });

  test("hub preview does not request Google Fonts", async ({ page }) => {
    const hits: string[] = [];
    page.on("request", (req) => {
      if (GOOGLE_FONT_HOST.test(req.url())) hits.push(req.url());
    });
    await page.goto("/reset", { waitUntil: "load" });
    await ready(page, /The Reset|Page not found/i);
    expect(hits).toEqual([]);
  });

  test("event detail does not request Google Fonts", async ({ page }) => {
    const hits: string[] = [];
    page.on("request", (req) => {
      if (GOOGLE_FONT_HOST.test(req.url())) hits.push(req.url());
    });
    await page.goto(SAMPLE_EVENT, { waitUntil: "load" });
    await expect(page.getByRole("navigation").first()).toBeVisible();
    expect(hits).toEqual([]);
  });

  test("desktop+mobile screenshots: after (local) and before (prod)", async ({ page }, testInfo) => {
    test.skip(!!process.env.CI, "hits live prod for visual compare; not part of dummy-env CI");
    test.setTimeout(180_000);
    const project = testInfo.project.name;
    const pages: Array<{ path: string; label: string; marker: RegExp; localOnly?: boolean }> = [
      { path: "/", label: "home", marker: /Charlotte's Premier Community|Where Charlotte Connects/i },
      { path: "/events", label: "events", marker: /Upcoming Events/i },
      { path: SAMPLE_EVENT, label: "event-detail", marker: /Upcoming Events|Coffee and Connect/i },
      { path: "/login", label: "login", marker: /Welcome back/i },
      { path: "/join", label: "join", marker: /Choose your membership/i },
      { path: "/reset", label: "hub-reset", marker: /The Reset|Page not found/i },
      { path: "/admin/login", label: "admin-events", marker: /Email|Sign in/i },
      {
        path:
          "/ambassadors/login?error=oauth_no_account&error_description=" +
          encodeURIComponent("No 704 account uses this Google email. Sign in with the email you joined with, or join at 704collective.com/join."),
        label: "ambassadors-login-refused",
        marker: /No 704 account uses this Google email/i,
        localOnly: true,
      },
    ];

    for (const p of pages) {
      const hits: string[] = [];
      const onReq = (req: { url: () => string }) => {
        if (GOOGLE_FONT_HOST.test(req.url())) hits.push(req.url());
      };
      page.on("request", onReq);
      await page.goto(p.path, { waitUntil: "load" });
      await ready(page, p.marker);
      await shot(page, project, p.label, "after");
      page.off("request", onReq);
      expect(hits, `Google Fonts on local ${p.path}`).toEqual([]);
    }

    for (const p of pages.filter((x) => !x.localOnly)) {
      await page.goto(`${PROD}${p.path}`, { waitUntil: "load" });
      await ready(page, p.marker);
      await shot(page, project, p.label, "before");
    }
  });

  test("member login still shows the refused-Google banner (simulated callback)", async ({ page }) => {
    await page.goto(
      "/login?error=oauth_no_account&error_description=" +
        encodeURIComponent("No 704 account uses this Google email. Sign in with the email you joined with, or join at 704collective.com/join."),
    );
    await expect(page.getByTestId("oauth-no-account")).toBeVisible();
    await expect(page.getByTestId("oauth-no-account")).toContainText("No 704 account uses this Google email");
  });

  test("ambassador login shows the same refused-Google banner (simulated callback)", async ({ page }) => {
    await page.goto(
      "/ambassadors/login?error=oauth_no_account&error_description=" +
        encodeURIComponent("No 704 account uses this Google email. Sign in with the email you joined with, or join at 704collective.com/join."),
    );
    await expect(page.getByTestId("oauth-no-account")).toBeVisible();
    await expect(page.getByTestId("oauth-no-account")).toContainText("No 704 account uses this Google email");
  });
});
