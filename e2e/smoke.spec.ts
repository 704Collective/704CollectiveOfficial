import { test, expect } from "@playwright/test";

test.describe("public routes (mobile viewport)", () => {
  test("home loads", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/704 Collective/i);
  });

  test("member login page", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByText("Welcome back")).toBeVisible();
  });

  test("admin login page", async ({ page }) => {
    await page.goto("/admin/login");
    await expect(page).toHaveURL(/\/admin\/login/);
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
  });

  test("admin request access page", async ({ page }) => {
    await page.goto("/admin/request-access");
    await expect(page).toHaveURL(/\/admin\/request-access/);
    await expect(page.getByLabel("Full Name")).toBeVisible();
    await expect(page.getByRole("button", { name: /submit request/i })).toBeVisible();
  });
});
