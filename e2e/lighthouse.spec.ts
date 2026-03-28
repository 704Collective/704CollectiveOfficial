import { test, expect } from "@playwright/test";
import lighthouse from "lighthouse";
import { launch as launchChrome } from "chrome-launcher";
import { chromium } from "playwright";

test.describe("Lighthouse (mobile emulation)", () => {
  test("homepage category score floors", async () => {
    test.skip(process.platform === "win32", "chrome-launcher temp cleanup can EPERM on Windows; runs in Linux CI");
    const url = new URL("/", "http://127.0.0.1:3000").href;
    const chromePath = chromium.executablePath();

    const chrome = await launchChrome({
      chromePath,
      chromeFlags: ["--headless=new", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
    });

    try {
      const runnerResult = await lighthouse(url, {
        logLevel: "error",
        port: chrome.port,
        output: "json",
        onlyCategories: ["performance", "accessibility"],
        screenEmulation: {
          mobile: true,
          width: 412,
          height: 823,
          deviceScaleFactor: 2.625,
          disabled: false,
        },
        formFactor: "mobile",
      });

      expect(runnerResult?.lhr, "Lighthouse returned no LHR").toBeTruthy();
      const lhr = runnerResult!.lhr;
      const perf = lhr.categories.performance?.score ?? 0;
      const a11y = lhr.categories.accessibility?.score ?? 0;

      expect(perf, `performance score was ${perf}`).toBeGreaterThanOrEqual(0.12);
      expect(a11y, `accessibility score was ${a11y}`).toBeGreaterThanOrEqual(0.88);
    } finally {
      try {
        await chrome.kill();
      } catch {
        /* ignore kill/cleanup errors */
      }
    }
  });
});
