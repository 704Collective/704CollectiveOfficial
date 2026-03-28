import { defineConfig, devices } from "@playwright/test";

/** Mirrors `.github/workflows/ci.yml` so `next start` can boot in CI. */
const nextServerEnv = {
  NEXT_PUBLIC_SITE_URL: "https://example.com",
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-test-key-for-ci-build-only",
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_test_ci",
  STRIPE_SECRET_KEY: "sk_test_ci",
  STRIPE_SOCIAL_PRODUCT_ID: "prod_test_ci",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-test-ci-only",
};

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "list",
  timeout: 60_000,
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "mobile-chrome",
      testIgnore: /lighthouse\.spec\.ts/,
      use: { ...devices["Pixel 7"] },
    },
    {
      name: "lighthouse",
      testMatch: /lighthouse\.spec\.ts/,
      timeout: 120_000,
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run start",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      ...process.env,
      ...nextServerEnv,
    },
  },
});
