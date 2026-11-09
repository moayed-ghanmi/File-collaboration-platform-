import "server-only";
import { randomBytes } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { db } from "./db";
import { env } from "./env";
import { formatBytes } from "./format";
import { canEditFiles, type Role } from "./roles";
import { deleteObjects, objectSize, presignDownload, presignUpload } from "./storage";

/** Expected, user-facing failure (permission, validation, not found). */
export class FileError extends Error {
  name = "FileError";
}

export const teamStoragePrefix = (teamId: string) => `teams/${teamId}/`;
const STALE_UPLOAD_MS = 60 * 60 * 1000;
const MAX_DEPTH = 64;

// ---------------------------------------------------------------------------
// Pure helpers

export function validateName(raw: unknown, kind: "File" | "Folder" = "File"): string {
  const name = String(raw ?? "").trim();
  if (!name || name.length > 255) throw new FileError(`${kind} name must be 1–255 characters.`);
  if (/[/\\\u0000-\u001f\u007f]/.test(name) || name === "." || name === "..") {
    throw new FileError(`${kind} names can't contain slashes or control characters.`);
  }
  return name;
}

/** First of "a.txt", "a (2).txt", "a (3).txt"… not in `taken` (compared case-insensitively). */
export function uniqueName(name: string, taken: Iterable<string>): string {
  const lower = new Set([...taken].map((n) => n.toLowerCase()));
  if (!lower.has(name.toLowerCase())) return name;
  const dot = name.lastIndexOf(".");
  const [stem, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ""];
  for (let i = 2; ; i++) {
    const candidate = `${stem} (${i})${ext}`;
    if (!lower.has(candidate.toLowerCase())) return candidate;
  }
}

export function sanitizeContentType(raw: unknown): string {
  const type = String(raw ?? "").trim().toLowerCase();
  return /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(type) && type.length <= 255 ? type : "application/octet-stream";
}

// ---------------------------------------------------------------------------
// Access

async function roleIn(userId: string, teamId: string, client: Prisma.TransactionClient = db()): Promise<Role> {
  const m = await client.membership.findUnique({ where: { userId_teamId: { userId, teamId } } });
  if (!m) throw new FileError("Not found.");
  return m.role as Role;
}

async function requireEditor(userId: string, teamId: string, client?: Prisma.TransactionClient) {
  const role = await roleIn(userId, teamId, client);
  if (!canEditFiles(role)) throw new FileError("Viewers can't change files.");
  return role;
}

async function serializable<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await db().$transaction(fn, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (e) {
      const conflict = e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2034";
      if (!conflict || attempt >= 3) throw conflict ? new FileError("Too many changes at once. Please try again.") : e;
    }
  }
}

/** A folder of `teamId`, or null for the top level. Throws if it belongs elsewhere. */
async function folderIn(teamId: string, folderId: string | null, client: Prisma.TransactionClient = db()) {
  if (!folderId) return null;
  const folder = await client.folder.findUnique({ where: { id: folderId } });
  if (!folder || folder.teamId !== teamId) throw new FileError("Folder not found.");
  return folder;
}

async function siblingNames(tx: Prisma.TransactionClient, teamId: string, parentId: string | null) {
  const [folders, files] = await Promise.all([
    tx.folder.findMany({ where: { teamId, parentId }, select: { id: true, name: true } }),
    tx.file.findMany({ where: { teamId, folderId: parentId, status: "READY" }, select: { id: true, name: true } }),
  ]);
  return { folders, files };
}

function assertFree(name: string, taken: { id: string; name: string }[], selfId?: string) {
  const clash = taken.find((t) => t.id !== selfId && t.name.toLowerCase() === name.toLowerCase());
  if (clash) throw new FileError(`"${clash.name}" already exists here.`);
}

// ---------------------------------------------------------------------------
// Browsing

export type FileItem = {
  id: string;
  name: string;
  size: number;
  contentType: string;
  createdAt: Date;
  uploadedBy: string | null;
};

/** Everything the folder view needs, or null when the user can't see it. */
export async function getFolderView(userId: string, slug: string, folderId: string | null) {
  const team = await db().team.findUnique({ where: { slug }, select: { id: true, name: true, slug: true } });
  if (!team) return null;
  const membership = await db().membership.findUnique({ where: { userId_teamId: { userId, teamId: team.id } } });
  if (!membership) return null;

  let folder: { id: string; name: string; parentId: string | null } | null = null;
  const breadcrumbs: { id: string; name: string }[] = [];
  if (folderId) {
    folder = await db().folder.findFirst({ where: { id: folderId, teamId: team.id } });
    if (!folder) return null;
    for (let f: typeof folder | null = folder, i = 0; f && i < MAX_DEPTH; i++) {
      breadcrumbs.unshift({ id: f.id, name: f.name });
      f = f.parentId ? await db().folder.findUnique({ where: { id: f.parentId } }) : null;
    }
  }

  const [folders, files, usage] = await Promise.all([
    db().folder.findMany({
      where: { teamId: team.id, parentId: folder?.id ?? null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, updatedAt: true },
    }),
    db().file.findMany({
      where: { teamId: team.id, folderId: folder?.id ?? null, status: "READY" },
      orderBy: { name: "asc" },
      include: { createdBy: { select: { name: true } } },
    }),
    db().file.aggregate({ where: { teamId: team.id, status: "READY" }, _sum: { size: true }, _count: true }),
  ]);

  return {
    team: { ...team, role: membership.role as Role },
    folder,
    breadcrumbs,
    folders,
    files: files.map(
      (f): FileItem => ({
        id: f.id,
        name: f.name,
        size: Number(f.size),
        contentType: f.contentType,
        createdAt: f.createdAt,
        uploadedBy: f.createdBy?.name ?? null,
      }),
    ),
    usage: { bytes: Number(usage._sum.size ?? 0), files: usage._count },
  };
}

// ---------------------------------------------------------------------------
// Folders

export async function createFolder(actorId: string, teamId: string, parentId: string | null, rawName: unknown) {
  const name = validateName(rawName, "Folder");
  return serializable(async (tx) => {
    await requireEditor(actorId, teamId, tx);
    await folderIn(teamId, parentId, tx);
    const { folders, files } = await siblingNames(tx, teamId, parentId);
    assertFree(name, [...folders, ...files]);
    return tx.folder.create({ data: { name, teamId, parentId, createdById: actorId } });
  });
}

export async function renameFolder(actorId: string, folderId: string, rawName: unknown) {
  const name = validateName(rawName, "Folder");
  await serializable(async (tx) => {
    const folder = await tx.folder.findUnique({ where: { id: folderId } });
    if (!folder) throw new FileError("Folder not found.");
    await requireEditor(actorId, folder.teamId, tx);
    const { folders, files } = await siblingNames(tx, folder.teamId, folder.parentId);
    assertFree(name, [...folders, ...files], folder.id);
    await tx.folder.update({ where: { id: folder.id }, data: { name } });
  });
}

/** Deletes the folder, everything inside it, and the stored objects. */
export async function deleteFolder(actorId: string, folderId: string) {
  const folder = await db().folder.findUnique({ where: { id: folderId } });
  if (!folder) throw new FileError("Folder not found.");
  await requireEditor(actorId, folder.teamId);

  const files = await db().$queryRaw<{ storageKey: string }[]>`
    WITH RECURSIVE tree AS (
      SELECT id FROM "Folder" WHERE id = ${folderId}
      UNION ALL
      SELECT f.id FROM "Folder" f JOIN tree t ON f."parentId" = t.id
    )
    SELECT "storageKey" FROM "File" WHERE "folderId" IN (SELECT id FROM tree)`;
  await db().folder.delete({ where: { id: folderId } }); // cascades to subfolders and files
  await removeObjects(files.map((f) => f.storageKey));
  return { parentId: folder.parentId, teamId: folder.teamId };
}

// ---------------------------------------------------------------------------
// Files

async function removeObjects(keys: string[]) {
  if (!keys.length) return;
  // Rows are already gone; an orphaned object is harmless, a broken row isn't.
  await deleteObjects(keys).catch((e) => console.error("[storage] delete failed", keys.length, e));
}

/** Removes abandoned uploads (browser closed mid-upload, PUT failed…) for a team. */
export async function cleanupStaleUploads(teamId: string, olderThanMs = STALE_UPLOAD_MS) {
  const stale = await db().file.findMany({
    where: { teamId, status: "UPLOADING", createdAt: { lt: new Date(Date.now() - olderThanMs) } },
    select: { id: true, storageKey: true },
  });
  if (!stale.length) return 0;
  await db().file.deleteMany({ where: { id: { in: stale.map((s) => s.id) } } });
  await removeObjects(stale.map((s) => s.storageKey));
  return stale.length;
}

export async function startUpload(
  actorId: string,
  teamId: string,
  folderId: string | null,
  input: { name: unknown; size: unknown; contentType: unknown },
) {
  const name = validateName(input.name);
  const size = Number(input.size);
  const max = env().MAX_UPLOAD_BYTES;
  if (!Number.isSafeInteger(size) || size < 0) throw new FileError("Invalid file size.");
  if (size > max) throw new FileError(`"${name}" is larger than the ${formatBytes(max)} limit.`);
  const contentType = sanitizeContentType(input.contentType);

  await requireEditor(actorId, teamId);
  await folderIn(teamId, folderId);
  await cleanupStaleUploads(teamId);

  const storageKey = `${teamStoragePrefix(teamId)}${randomBytes(16).toString("hex")}`;
  const file = await db().file.create({
    data: { name, size, contentType, storageKey, teamId, folderId, createdById: actorId },
  });
  return { fileId: file.id, uploadUrl: await presignUpload(storageKey, contentType, size), contentType };
}

/** Confirms the object landed in storage, then publishes the file under a free name. */
export async function completeUpload(actorId: string, fileId: string) {
  const file = await db().file.findUnique({ where: { id: fileId } });
  if (!file || file.createdById !== actorId || file.status !== "UPLOADING") throw new FileError("Upload not found.");

  const stored = await objectSize(file.storageKey);
  if (stored === null) throw new FileError("The upload didn't reach storage. Please try again.");
  if (stored !== Number(file.size)) {
    await db().file.delete({ where: { id: file.id } });
    await removeObjects([file.storageKey]);
    throw new FileError("The uploaded file didn't match its declared size.");
  }

  return serializable(async (tx) => {
    await requireEditor(actorId, file.teamId, tx);
    const { folders, files } = await siblingNames(tx, file.teamId, file.folderId);
    const name = uniqueName(file.name, [...folders, ...files].map((s) => s.name));
    return tx.file.update({ where: { id: file.id }, data: { name, status: "READY" }, select: { id: true, name: true } });
  });
}

async function readyFile(fileId: string) {
  const file = await db().file.findUnique({ where: { id: fileId } });
  if (!file || file.status !== "READY") throw new FileError("File not found.");
  return file;
}

export async function renameFile(actorId: string, fileId: string, rawName: unknown) {
  const name = validateName(rawName);
  await serializable(async (tx) => {
    const file = await tx.file.findUnique({ where: { id: fileId } });
    if (!file || file.status !== "READY") throw new FileError("File not found.");
    await requireEditor(actorId, file.teamId, tx);
    const { folders, files } = await siblingNames(tx, file.teamId, file.folderId);
    assertFree(name, [...folders, ...files], file.id);
    await tx.file.update({ where: { id: file.id }, data: { name } });
  });
}

export async function deleteFile(actorId: string, fileId: string) {
  const file = await readyFile(fileId);
  await requireEditor(actorId, file.teamId);
  await db().file.delete({ where: { id: file.id } });
  await removeObjects([file.storageKey]);
}

/** Short-lived download URL. Any team member, including viewers, may download. */
export async function downloadUrl(userId: string, fileId: string) {
  const file = await readyFile(fileId);
  await roleIn(userId, file.teamId).catch(() => {
    throw new FileError("File not found.");
  });
  return presignDownload(file.storageKey, file.name);
}
