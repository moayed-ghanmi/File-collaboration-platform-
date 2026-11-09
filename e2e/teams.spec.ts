import { expect, test, type Browser, type Page } from "@playwright/test";
import { linkFromEmail, signUp, uniqueEmail } from "./helpers";

const password = "correct-horse-1";

// Separate browser per user, each with its own client IP (auth is rate limited per IP).
async function newUserPage(browser: Browser): Promise<Page> {
  const ip = `10.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 254) + 1}`;
  const context = await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": ip } });
  const page = await context.newPage();
  page.on("dialog", (d) => void d.accept());
  return page;
}

async function verifiedUser(browser: Browser, name: string, email: string): Promise<Page> {
  const page = await newUserPage(browser);
  await signUp(page, name, email, password);
  await page.goto(await linkFromEmail(email, /verify/i));
  await expect(page).toHaveURL(/\/dashboard/);
  return page;
}

async function createTeam(page: Page, name: string) {
  await page.goto("/dashboard");
  await page.getByLabel("New team name").fill(name);
  await page.getByRole("button", { name: "Create team" }).click();
  await expect(page).toHaveURL(/\/teams\/[\w-]+$/);
  await expect(page.getByRole("heading", { name })).toBeVisible();
  await expect(page.getByTestId("my-role")).toContainText("an owner");
}

async function invite(page: Page, email: string, role: string) {
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Role", { exact: true }).selectOption({ label: role });
  await page.getByRole("button", { name: "Send invitation" }).click();
  await expect(page.getByText(`Invitation sent to ${email}.`)).toBeVisible();
  await expect(page.getByTestId("invitation-row").filter({ hasText: email })).toBeVisible();
}

test("invite a new user by email → they sign up from the link → manage their role → remove them", async ({ browser }) => {
  const teamName = `Design ${Date.now()}`;
  const ownerEmail = uniqueEmail("owner");
  const bobEmail = uniqueEmail("bob");

  const owner = await verifiedUser(browser, "Olivia Owner", ownerEmail);
  await createTeam(owner, teamName);
  const teamUrl = owner.url();
  await invite(owner, bobEmail, "Member");

  // Bob has no account: the link sends him through sign-up and back to the invitation.
  const bob = await newUserPage(browser);
  const inviteLink = await linkFromEmail(bobEmail, /invited you to/);
  await bob.goto(inviteLink);
  await expect(bob).toHaveURL(/\/sign-in\?next=%2Finvite%2F/);
  await bob.getByRole("link", { name: "Create an account" }).click();
  await expect(bob).toHaveURL(/\/sign-up\?next=%2Finvite%2F/);
  await signUp(bob, "Bob Builder", bobEmail, password, { navigate: false });
  await bob.goto(await linkFromEmail(bobEmail, /verify/i));
  await expect(bob).toHaveURL(new URL(inviteLink).pathname);
  await expect(bob.getByText(/Olivia Owner invited you to join/)).toBeVisible();
  await bob.getByRole("button", { name: "Accept invitation" }).click();
  await expect(bob).toHaveURL(teamUrl);
  await expect(bob.getByTestId("my-role")).toContainText("a member");
  // Members can't manage the team.
  await expect(bob.getByRole("button", { name: "Send invitation" })).toHaveCount(0);
  await expect(bob.getByRole("button", { name: "Remove" })).toHaveCount(0);

  // The link is single-use.
  await bob.goto(inviteLink);
  await expect(bob.getByText("Invitation not available")).toBeVisible();

  // Owner sees Bob, demotes him to viewer, then removes him.
  await owner.reload();
  await expect(owner.getByTestId("invitation-row")).toHaveCount(0);
  const bobRow = owner.getByTestId("member-row").filter({ hasText: bobEmail });
  await bobRow.getByLabel("Role for Bob Builder").selectOption("VIEWER");
  await expect(async () => {
    await bob.goto(teamUrl);
    await expect(bob.getByTestId("my-role")).toContainText("a viewer", { timeout: 1000 });
  }).toPass();

  await bobRow.getByRole("button", { name: "Remove" }).click();
  await expect(owner.getByTestId("member-row").filter({ hasText: bobEmail })).toHaveCount(0);
  await bob.goto(teamUrl);
  await expect(bob.getByText("This page could not be found.")).toBeVisible();
});

test("existing user accepts from the dashboard, leaves; owner can't leave alone and deletes the team", async ({ browser }) => {
  const teamName = `Ops ${Date.now()}`;
  const owner = await verifiedUser(browser, "Omar Owner", uniqueEmail("owner"));
  const carolEmail = uniqueEmail("carol");
  const carol = await verifiedUser(browser, "Carol Coder", carolEmail);

  await createTeam(owner, teamName);
  const teamUrl = owner.url();
  await invite(owner, carolEmail, "Admin");

  await carol.goto("/dashboard");
  const invitation = carol.getByTestId("pending-invitation").filter({ hasText: teamName });
  await expect(invitation).toContainText("Omar Owner invited you to");
  await invitation.getByRole("button", { name: "Accept" }).click();
  await expect(carol).toHaveURL(teamUrl);
  await expect(carol.getByTestId("my-role")).toContainText("an admin");
  // Admins can invite, but can't delete the team or touch the owner.
  await expect(carol.getByRole("button", { name: "Send invitation" })).toBeVisible();
  await expect(carol.getByRole("button", { name: "Delete team" })).toHaveCount(0);
  await expect(carol.getByTestId("member-row").filter({ hasText: "Omar Owner" }).getByRole("button")).toHaveCount(0);

  await carol.getByRole("button", { name: "Leave team" }).click();
  await expect(carol).toHaveURL(/\/dashboard$/);
  await expect(carol.getByRole("link", { name: new RegExp(teamName) })).toHaveCount(0);

  await owner.reload();
  await owner.getByRole("button", { name: "Leave team" }).click();
  await expect(owner.getByText(/You're the only owner/)).toBeVisible();

  await owner.getByRole("button", { name: "Delete team" }).click();
  await expect(owner).toHaveURL(/\/dashboard$/);
  await expect(owner.getByRole("link", { name: new RegExp(teamName) })).toHaveCount(0);
});
