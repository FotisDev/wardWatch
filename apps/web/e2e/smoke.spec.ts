import { expect, test } from "@playwright/test";

test.describe("signed out", () => {
  for (const path of ["/", "/handover", "/audit"]) {
    test(`${path} redirects to login`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login$/);
    });
  }

  test("login form is usable", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "WardWatch" })).toBeVisible();
    await expect(page.getByPlaceholder("Email")).toHaveAttribute("type", "email");
    await expect(page.getByPlaceholder("Password")).toHaveAttribute("type", "password");
    await expect(page.getByRole("button", { name: "Sign in" })).toBeEnabled();
    await expect(page.getByRole("button", { name: "Create account" })).toBeEnabled();
  });

  test("login shows errors passed back from the server", async ({ page }) => {
    await page.goto("/login?error=Invalid%20login%20credentials");
    await expect(page.getByText("Invalid login credentials")).toBeVisible();
  });
});

test.describe("PWA", () => {
  test("manifest is served and installable", async ({ request }) => {
    const res = await request.get("/manifest.webmanifest");
    expect(res.ok()).toBe(true);
    const manifest = await res.json();
    expect(manifest).toMatchObject({ name: "WardWatch", display: "standalone", start_url: "/" });
    expect(manifest.icons.map((i: { sizes: string }) => i.sizes)).toEqual(
      expect.arrayContaining(["192x192", "512x512"]),
    );
  });

  test("icons are PNGs", async ({ request }) => {
    for (const size of [192, 512]) {
      const res = await request.get(`/pwa-icon/${size}`);
      expect(res.headers()["content-type"]).toBe("image/png");
    }
  });

  test("service worker handles push", async ({ request }) => {
    const res = await request.get("/sw.js");
    expect(res.ok()).toBe(true);
    expect(await res.text()).toContain('addEventListener("push"');
  });
});
