import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CreateBucketCommand, HeadBucketCommand } from "@aws-sdk/client-s3";
import { db } from "./db";
import { env } from "./env";
import { s3, objectSize } from "./storage";
import {
  cleanupStaleUploads,
  completeUpload,
  createFolder,
  deleteFile,
  deleteFolder,
  downloadUrl,
  FileError,
  getFolderView,
  renameFile,
  renameFolder,
  sanitizeContentType,
  startUpload,
  uniqueName,
  validateName,
} from "./files";
import { deleteTeam } from "./teams";

const run = `${Date.now()}`;
let owner: string, viewer: string, outsider: string;
let teamId: string, slug: string;

async function upload(name: string, body: string, folderId: string | null = null, actor = owner) {
  const bytes = new TextEncoder().encode(body);
  const { fileId, uploadUrl, contentType } = await startUpload(actor, teamId, folderId, {
    name,
    size: bytes.length,
    contentType: "text/plain",
  });
  const res = await fetch(uploadUrl, { method: "PUT", body: bytes, headers: { "content-type": contentType } });
  expect(res.status).toBe(200);
  return completeUpload(actor, fileId);
}

beforeAll(async () => {
  const bucket = env().S3_BUCKET;
  await s3()
    .send(new HeadBucketCommand({ Bucket: bucket }))
    .catch(() => s3().send(new CreateBucketCommand({ Bucket: bucket })));

  const mk = (who: string) =>
    db().user.create({ data: { name: who, email: `files-${who}-${run}@example.test`, emailVerified: true } });
  [owner, viewer, outsider] = (await Promise.all([mk("owner"), mk("viewer"), mk("outsider")])).map((u) => u.id);
  const team = await db().team.create({
    data: {
      name: "Files team",
      slug: `files-${run}`,
      memberships: { create: [{ userId: owner, role: "OWNER" }, { userId: viewer, role: "VIEWER" }] },
    },
  });
  teamId = team.id;
  slug = team.slug;
});

afterAll(async () => {
  await db().team.deleteMany({ where: { slug: { startsWith: `files-${run}` } } });
  await db().user.deleteMany({ where: { email: { endsWith: `-${run}@example.test` } } });
});

describe("helpers", () => {
  it("validates names", () => {
    expect(validateName("  report.pdf ")).toBe("report.pdf");
    for (const bad of ["", "a/b", "a\\b", "..", "x\u0000"]) expect(() => validateName(bad)).toThrow(FileError);
  });

  it("finds a free name", () => {
    expect(uniqueName("a.txt", ["b.txt"])).toBe("a.txt");
    expect(uniqueName("a.txt", ["A.TXT", "a (2).txt"])).toBe("a (3).txt");
    expect(uniqueName("Notes", ["notes"])).toBe("Notes (2)");
    expect(uniqueName(".env", [".env"])).toBe(".env (2)");
  });

  it("sanitizes content types", () => {
    expect(sanitizeContentType("Image/PNG")).toBe("image/png");
    expect(sanitizeContentType("text/html\r\nx: y")).toBe("application/octet-stream");
  });
});

describe("files and folders", () => {
  it("uploads to storage, lists, and downloads", async () => {
    const file = await upload("hello.txt", "hello world");
    const view = await getFolderView(owner, slug, null);
    expect(view?.files).toEqual([expect.objectContaining({ id: file.id, name: "hello.txt", size: 11, uploadedBy: "owner" })]);
    expect(view?.usage).toEqual({ bytes: 11, files: 1 });

    const res = await fetch(await downloadUrl(viewer, file.id));
    expect(await res.text()).toBe("hello world");
    expect(res.headers.get("content-disposition")).toContain("attachment");
  });

  it("renames duplicate uploads instead of overwriting", async () => {
    const second = await upload("HELLO.txt", "again");
    expect(second.name).toBe("HELLO (2).txt");
  });

  it("hides UPLOADING files and rejects completion before the object exists", async () => {
    const { fileId } = await startUpload(owner, teamId, null, { name: "ghost.txt", size: 3, contentType: "text/plain" });
    expect((await getFolderView(owner, slug, null))?.files.map((f) => f.name)).not.toContain("ghost.txt");
    await expect(completeUpload(owner, fileId)).rejects.toThrow(/didn't reach storage/);
    await expect(completeUpload(viewer, fileId)).rejects.toThrow(/not found/);
  });

  it("storage rejects a body whose size differs from the signed size", async () => {
    const { uploadUrl } = await startUpload(owner, teamId, null, { name: "liar.txt", size: 3, contentType: "text/plain" });
    const res = await fetch(uploadUrl, { method: "PUT", body: "much longer body", headers: { "content-type": "text/plain" } });
    expect(res.ok).toBe(false);
  });

  it("enforces the size limit", async () => {
    await expect(
      startUpload(owner, teamId, null, { name: "big.bin", size: env().MAX_UPLOAD_BYTES + 1, contentType: "" }),
    ).rejects.toThrow(/limit/);
  });

  it("cleans up abandoned uploads", async () => {
    expect(await cleanupStaleUploads(teamId, 0)).toBeGreaterThanOrEqual(2); // ghost + liar
    expect(await db().file.count({ where: { teamId, status: "UPLOADING" } })).toBe(0);
  });

  it("viewers and outsiders can't change anything", async () => {
    await expect(createFolder(viewer, teamId, null, "x")).rejects.toThrow(/Viewers/);
    await expect(startUpload(viewer, teamId, null, { name: "x", size: 1, contentType: "" })).rejects.toThrow(/Viewers/);
    const [file] = (await getFolderView(owner, slug, null))!.files;
    await expect(renameFile(viewer, file.id, "y")).rejects.toThrow(/Viewers/);
    await expect(deleteFile(viewer, file.id)).rejects.toThrow(/Viewers/);
    await expect(downloadUrl(outsider, file.id)).rejects.toThrow(/not found/);
    expect(await getFolderView(outsider, slug, null)).toBeNull();
  });

  it("creates nested folders with breadcrumbs and prevents name clashes", async () => {
    const docs = await createFolder(owner, teamId, null, "Docs");
    const specs = await createFolder(owner, teamId, docs.id, "Specs");
    await expect(createFolder(owner, teamId, null, "docs")).rejects.toThrow(/already exists/);
    await expect(createFolder(owner, teamId, null, "hello.txt")).rejects.toThrow(/already exists/);
    await expect(renameFolder(owner, specs.id, "Specs")).resolves.toBeUndefined(); // same name is fine

    const view = await getFolderView(viewer, slug, specs.id);
    expect(view?.breadcrumbs.map((b) => b.name)).toEqual(["Docs", "Specs"]);
    expect(await getFolderView(owner, "wrong-team", specs.id)).toBeNull();
  });

  it("renames files and refuses clashes", async () => {
    const view = (await getFolderView(owner, slug, null))!;
    const file = view.files.find((f) => f.name === "hello.txt")!;
    await expect(renameFile(owner, file.id, "Docs")).rejects.toThrow(/already exists/);
    await renameFile(owner, file.id, "greeting.txt");
    expect((await getFolderView(owner, slug, null))!.files.map((f) => f.name)).toContain("greeting.txt");
  });

  it("deleting a folder removes its subtree and stored objects", async () => {
    const top = await createFolder(owner, teamId, null, "Trash me");
    const inner = await createFolder(owner, teamId, top.id, "Inner");
    const a = await upload("a.txt", "a", top.id);
    const b = await upload("b.txt", "b", inner.id);
    const keys = await db().file.findMany({ where: { id: { in: [a.id, b.id] } }, select: { storageKey: true } });

    await deleteFolder(owner, top.id);
    expect(await db().folder.count({ where: { id: { in: [top.id, inner.id] } } })).toBe(0);
    expect(await db().file.count({ where: { id: { in: [a.id, b.id] } } })).toBe(0);
    for (const k of keys) expect(await objectSize(k.storageKey)).toBeNull();
  });

  it("deleting a file removes the stored object", async () => {
    const f = await upload("temp.txt", "tmp");
    const { storageKey } = await db().file.findUniqueOrThrow({ where: { id: f.id } });
    await deleteFile(owner, f.id);
    expect(await objectSize(storageKey)).toBeNull();
  });

  it("deleting the team removes all its objects", async () => {
    const { storageKey } = await db().file.findFirstOrThrow({ where: { teamId } });
    await deleteTeam(owner, teamId);
    expect(await objectSize(storageKey)).toBeNull();
  });
});
