import { expect, test } from "@playwright/test";
import { linkFromEmail, signIn, signUp, uniqueEmail } from "./helpers";

// Auth endpoints are rate limited per client IP; give each test its own.
test.beforeEach(async ({ page }) => {
  const ip = `10.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 254) + 1}`;
  await page.setExtraHTTPHeaders({ "x-forwarded-for": ip });
});

test("repeated failed sign-ins are rate limited", async ({ page }) => {
  const email = uniqueEmail("ratelimit");
  for (let i = 0; i < 3; i++) {
    await signIn(page, email, "wrong-password");
    await expect(page.getByText("Invalid email or password.")).toBeVisible();
  }
  await signIn(page, email, "wrong-password");
  await expect(page.getByText(/too many requests/i)).toBeVisible();
});

test("protected pages redirect to sign-in and keep the destination", async ({ page }) => {
  await page.goto("/settings/profile");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fsettings%2Fprofile/);
});

test("protected API returns 401 without a session", async ({ request }) => {
  const res = await request.get("/api/me");
  expect(res.status()).toBe(401);
});

test("auth forms never fall back to GET (which would put passwords in the URL)", async ({ request }) => {
  for (const path of ["/sign-in", "/sign-up", "/reset-password?token=x", "/forgot-password"]) {
    const html = await (await request.get(path)).text();
    expect(html, path).toMatch(/<form[^>]*method="post"/);
    expect(html, path).not.toMatch(/<form(?![^>]*method="post")[^>]*>/);
  }
});

test("sign up → verify email → dashboard → sign out → sign in", async ({ page }) => {
  const email = uniqueEmail("signup");
  const password = "correct-horse-1";

  await signUp(page, "Ada Lovelace", email, password);
  await expect(page.getByText(email)).toBeVisible();

  // Unverified accounts can't sign in yet.
  await signIn(page, email, password);
  await expect(page.getByText(/verify your email first/i)).toBeVisible();

  await page.goto(await linkFromEmail(email, /verify/i));
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole("heading", { name: "Welcome, Ada Lovelace" })).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in/);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/sign-in/);

  await signIn(page, email, "wrong-password");
  await expect(page.getByText("Invalid email or password.")).toBeVisible();

  await signIn(page, email, password);
  await expect(page).toHaveURL(/\/dashboard/);

  // Profile: rename shows up in the header.
  await page.getByRole("link", { name: "Profile" }).click();
  await page.getByLabel("Name", { exact: true }).fill("Ada King");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Profile saved.")).toBeVisible();
  await expect(page.getByTestId("user-name")).toHaveText("Ada King");
});

test("forgot password → reset via email → sign in with the new password", async ({ page }) => {
  const email = uniqueEmail("reset");
  const oldPassword = "correct-horse-1";
  const newPassword = "battery-staple-2";

  await signUp(page, "Grace Hopper", email, oldPassword);
  await page.goto(await linkFromEmail(email, /verify/i));
  await expect(page).toHaveURL(/\/dashboard/);
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in/);

  await page.getByRole("link", { name: "Forgot password?" }).click();
  await expect(page).toHaveURL(/\/forgot-password/);
  await expect(page.getByRole("heading", { name: "Reset your password" })).toBeVisible();
  // Scope to the reset form: the previous sign-in page stays mounted (hidden).
  const resetForm = page.locator("form", { has: page.getByRole("button", { name: "Send reset link" }) });
  await resetForm.getByLabel("Email").fill(email);
  await resetForm.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByText(/reset link is on its way/i)).toBeVisible();

  await page.goto(await linkFromEmail(email, /reset/i));
  await expect(page).toHaveURL(/\/reset-password\?token=/);
  await page.getByLabel("New password", { exact: true }).fill(newPassword);
  await page.getByLabel("Confirm new password").fill(newPassword);
  await page.getByRole("button", { name: "Set new password" }).click();

  await expect(page).toHaveURL(/\/sign-in\?reset=1/);
  await expect(page.getByText(/password was changed/i)).toBeVisible();

  await signIn(page, email, oldPassword);
  await expect(page.getByText("Invalid email or password.")).toBeVisible();
  await signIn(page, email, newPassword);
  await expect(page).toHaveURL(/\/dashboard/);
});

test("an invalid reset link shows a helpful error", async ({ page }) => {
  await page.goto("/reset-password?error=INVALID_TOKEN");
  await expect(page.getByText(/invalid or has expired/i)).toBeVisible();
});
