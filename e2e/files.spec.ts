import { expect, test, type Browser, type Page } from "@playwright/test";
import { linkFromEmail, signUp, uniqueEmail } from "./helpers";

const password = "correct-horse-1";

async function verifiedUser(browser: Browser, name: string, email: string): Promise<Page> {
  const ip = `10.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 254) + 1}`;
  const context = await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": ip } });
  const page = await context.newPage();
  page.on("dialog", (d) => void d.accept());
  await signUp(page, name, email, password);
  await page.goto(await linkFromEmail(email, /verify/i));
  await expect(page).toHaveURL(/\/dashboard/);
  return page;
}

const txt = (name: string, body: string) => ({ name, mimeType: "text/plain", buffer: Buffer.from(body) });

async function uploadFiles(page: Page, files: ReturnType<typeof txt>[]) {
  await page.getByLabel("Upload files").filter({ visible: true }).setInputFiles(files);
  for (const f of files) {
    await expect(page.getByTestId("upload-row").filter({ hasText: f.name, visible: true }).last()).not.toContainText("%");
  }
}

// Next keeps recently visited pages mounted (hidden), so only match what is on screen.
const fileRow = (page: Page, name: string) => page.getByTestId("file-row").filter({ hasText: name, visible: true });

async function downloadText(page: Page, name: string): Promise<{ text: string; filename: string }> {
  const [download] = await Promise.all([page.waitForEvent("download"), fileRow(page, name).getByRole("link").click()]);
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(c as Buffer);
  return { text: Buffer.concat(chunks).toString(), filename: download.suggestedFilename() };
}

test("upload, organise, download, rename and delete files; viewers are read-only", async ({ browser }) => {
  const teamName = `Files ${Date.now()}`;
  const owner = await verifiedUser(browser, "Fiona Files", uniqueEmail("files-owner"));
  const viewerEmail = uniqueEmail("files-viewer");
  const viewer = await verifiedUser(browser, "Victor Viewer", viewerEmail);

  await owner.getByLabel("New team name").fill(teamName);
  await owner.getByRole("button", { name: "Create team" }).click();
  await expect(owner).toHaveURL(/\/teams\/[\w-]+$/);
  await owner.getByRole("navigation", { name: "Team sections" }).getByRole("link", { name: "Files" }).click();
  await expect(owner).toHaveURL(/\/files$/);
  const filesUrl = owner.url();
  await expect(owner.getByText("This folder is empty.")).toBeVisible();

  // Two uploads at once, then a duplicate name gets a suffix instead of overwriting.
  await uploadFiles(owner, [txt("notes.txt", "first notes"), txt("plan.md", "# plan")]);
  await expect(fileRow(owner, "notes.txt")).toContainText("11 B");
  await expect(fileRow(owner, "plan.md")).toBeVisible();
  await uploadFiles(owner, [txt("notes.txt", "second")]);
  await expect(owner.getByText('Saved as "notes (2).txt"')).toBeVisible();
  await expect(fileRow(owner, "notes (2).txt")).toBeVisible();

  const first = await downloadText(owner, "notes.txt");
  expect(first).toEqual({ text: "first notes", filename: "notes.txt" });

  // Folders, nested upload and breadcrumbs.
  await owner.getByLabel("New folder").fill("Reports");
  await owner.getByRole("button", { name: "Create folder" }).click();
  await owner.getByTestId("folder-row").getByRole("link", { name: "Reports" }).click();
  await expect(owner.getByRole("navigation", { name: "Breadcrumb" })).toContainText("All files/Reports");
  await uploadFiles(owner, [txt("q3.csv", "a,b\n1,2")]);
  await expect(fileRow(owner, "q3.csv")).toBeVisible();
  const reportsUrl = owner.url();

  // Rename and delete.
  await owner.getByRole("button", { name: "Rename q3.csv" }).click();
  await owner.getByLabel("New name for q3.csv").fill("q3-final.csv");
  await owner.getByRole("button", { name: "Save" }).click();
  await expect(fileRow(owner, "q3-final.csv")).toBeVisible();
  await owner.getByRole("link", { name: "All files" }).click();
  await owner.getByRole("button", { name: "Delete notes (2).txt" }).click();
  await expect(fileRow(owner, "notes (2).txt")).toHaveCount(0);

  // Invite the viewer.
  await owner.getByRole("link", { name: "Members & settings" }).click();
  await owner.getByLabel("Email address").fill(viewerEmail);
  await owner.getByLabel("Role", { exact: true }).selectOption("VIEWER");
  await owner.getByRole("button", { name: "Send invitation" }).click();
  await expect(owner.getByText(`Invitation sent to ${viewerEmail}.`)).toBeVisible();
  await viewer.goto("/dashboard");
  await viewer.getByTestId("pending-invitation").getByRole("button", { name: "Accept" }).click();
  await expect(viewer.getByTestId("my-role")).toContainText("a viewer");

  // Viewer: can browse and download, can't change anything.
  await viewer.goto(filesUrl);
  await expect(viewer.getByText("Viewer (read-only)")).toBeVisible();
  await expect(viewer.getByLabel("Upload files")).toHaveCount(0);
  await expect(viewer.getByRole("button", { name: /Rename|Delete|Create folder/ })).toHaveCount(0);
  expect((await downloadText(viewer, "plan.md")).text).toBe("# plan");
  await viewer.goto(reportsUrl);
  await expect(fileRow(viewer, "q3-final.csv")).toBeVisible();

  // Deleting a folder removes its contents.
  await owner.goto(filesUrl);
  await owner.getByRole("button", { name: "Delete Reports" }).click();
  await expect(owner.getByTestId("folder-row")).toHaveCount(0);
  await viewer.goto(reportsUrl);
  await expect(viewer.getByText("This page could not be found.")).toBeVisible();
});

test("downloads require team membership", async ({ browser, request }) => {
  const owner = await verifiedUser(browser, "Dana Download", uniqueEmail("dl-owner"));
  await owner.getByLabel("New team name").fill(`Private ${Date.now()}`);
  await owner.getByRole("button", { name: "Create team" }).click();
  await owner.getByRole("navigation", { name: "Team sections" }).getByRole("link", { name: "Files" }).click();
  await uploadFiles(owner, [txt("secret.txt", "classified")]);
  const href = await fileRow(owner, "secret.txt").getByRole("link").getAttribute("href");

  expect((await request.get(href!, { maxRedirects: 0 })).status()).toBe(401);
  const outsider = await verifiedUser(browser, "Oscar Outsider", uniqueEmail("dl-outsider"));
  expect((await outsider.request.get(href!, { maxRedirects: 0 })).status()).toBe(404);
  await outsider.goto(owner.url());
  await expect(outsider.getByText("This page could not be found.")).toBeVisible();
});
