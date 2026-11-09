import { expect, type Page } from "@playwright/test";

const MAILPIT = process.env.MAILPIT_URL ?? "http://localhost:8025";

export function uniqueEmail(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;
}

/** Polls Mailpit for the newest email to `to` whose subject matches, and returns its first link. */
export async function linkFromEmail(to: string, subject: RegExp): Promise<string> {
  let link: string | undefined;
  await expect
    .poll(
      async () => {
        const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`);
        const { messages } = (await res.json()) as { messages: { ID: string; Subject: string }[] };
        const msg = messages.find((m) => subject.test(m.Subject));
        if (!msg) return undefined;
        const full = (await (await fetch(`${MAILPIT}/api/v1/message/${msg.ID}`)).json()) as { Text: string };
        link = full.Text.match(/https?:\/\/\S+/)?.[0];
        return link;
      },
      { message: `email "${subject}" to ${to}`, timeout: 15_000 },
    )
    .toBeTruthy();
  return link!;
}

export async function signUp(page: Page, name: string, email: string, password: string) {
  await page.goto("/sign-up");
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/check-email/);
}

export async function signIn(page: Page, email: string, password: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}
