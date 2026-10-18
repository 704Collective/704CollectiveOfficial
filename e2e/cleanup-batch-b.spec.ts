import { test, expect, type ConsoleMessage } from "@playwright/test";

function isHydration418(msg: ConsoleMessage) {
  const text = msg.text();
  return (
    msg.type() === "error" &&
    (/Minified React error #418/i.test(text) ||
      /Hydration failed/i.test(text) ||
      /did not match/i.test(text))
  );
}

test.describe("cleanup batch B", () => {
  test("home has no React #418 hydration mismatch", async ({ page }) => {
    const hydration: string[] = [];
    page.on("console", (msg) => {
      if (isHydration418(msg)) hydration.push(msg.text());
    });
    page.on("pageerror", (err) => {
      if (/#418|Hydration failed/i.test(err.message)) hydration.push(err.message);
    });

    await page.goto("/", { waitUntil: "load" });
    await expect(page.locator("body")).toContainText(/Where Charlotte Connects/i, {
      timeout: 20_000,
    });
    await page.waitForTimeout(1500);
    expect(hydration, hydration.join("\n")).toEqual([]);
  });

  test("manifest.json returns 200 and is linked", async ({ page, request }) => {
    const viaRewrite = await request.get("/manifest.json");
    const native = await request.get("/manifest.webmanifest");
    expect(native.status(), await native.text()).toBe(200);
    expect(viaRewrite.status(), await viaRewrite.text()).toBe(200);
    const body = await native.json();
    expect(body.name).toBe("704 Collective");
    expect(body.short_name).toBe("704");
    expect(body.start_url).toBe("/");
    expect(body.display).toBe("standalone");

    const missing: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error" && /manifest/i.test(msg.text()) && /404/i.test(msg.text())) {
        missing.push(msg.text());
      }
    });
    const failed: string[] = [];
    page.on("response", (r) => {
      const path = new URL(r.url()).pathname;
      if ((path === "/manifest.json" || path === "/manifest.webmanifest") && r.status() === 404) {
        failed.push(r.url());
      }
    });
    await page.goto("/", { waitUntil: "load" });
    expect(missing, missing.join("\n")).toEqual([]);
    expect(failed, failed.join("\n")).toEqual([]);
  });

  test("calendar-feed: unknown token 404, bad token 400", async ({ request }) => {
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    test.skip(
      !base || /example\.supabase/i.test(base),
      "CI dummy env has no live calendar-feed",
    );
    const unknown = await request.get(
      `${base}/functions/v1/calendar-feed?token=aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee`,
    );
    expect(unknown.status()).toBe(404);
    const bad = await request.get(`${base}/functions/v1/calendar-feed?token=not-a-uuid`);
    expect(bad.status()).toBe(400);
  });
});
