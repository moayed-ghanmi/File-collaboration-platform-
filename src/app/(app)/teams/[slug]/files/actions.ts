"use server";

import { refresh } from "next/cache";
import { requireSession } from "@/lib/session";
import * as files from "@/lib/files";
import type { ActionState } from "@/components/action-form";

// Every action re-checks the session; the service layer enforces team permissions.

const field = (form: FormData, key: string) => String(form.get(key) ?? "");
const optionalId = (form: FormData, key: string) => field(form, key) || null;

async function attempt(fn: () => Promise<string | void>): Promise<ActionState> {
  try {
    const success = await fn();
    refresh();
    return success ? { success } : null;
  } catch (e) {
    if (e instanceof files.FileError) return { error: e.message };
    throw e;
  }
}

export type StartUploadResult = { fileId: string; uploadUrl: string; contentType: string } | { error: string };

export async function startUploadAction(
  teamId: string,
  folderId: string | null,
  file: { name: string; size: number; type: string },
): Promise<StartUploadResult> {
  const { user } = await requireSession();
  try {
    return await files.startUpload(user.id, teamId, folderId, { name: file.name, size: file.size, contentType: file.type });
  } catch (e) {
    if (e instanceof files.FileError) return { error: e.message };
    throw e;
  }
}

export async function completeUploadAction(fileId: string): Promise<{ name: string } | { error: string }> {
  const { user } = await requireSession();
  try {
    const file = await files.completeUpload(user.id, fileId);
    refresh();
    return { name: file.name };
  } catch (e) {
    if (e instanceof files.FileError) return { error: e.message };
    throw e;
  }
}

export async function createFolderAction(_: ActionState, form: FormData): Promise<ActionState> {
  const { user } = await requireSession();
  return attempt(async () => {
    const folder = await files.createFolder(user.id, field(form, "teamId"), optionalId(form, "parentId"), form.get("name"));
    return `Created folder "${folder.name}".`;
  });
}

export async function renameFolderAction(_: ActionState, form: FormData): Promise<ActionState> {
  const { user } = await requireSession();
  return attempt(() => files.renameFolder(user.id, field(form, "folderId"), form.get("name")));
}

export async function deleteFolderAction(_: ActionState, form: FormData): Promise<ActionState> {
  const { user } = await requireSession();
  return attempt(async () => {
    await files.deleteFolder(user.id, field(form, "folderId"));
  });
}

export async function renameFileAction(_: ActionState, form: FormData): Promise<ActionState> {
  const { user } = await requireSession();
  return attempt(() => files.renameFile(user.id, field(form, "fileId"), form.get("name")));
}

export async function deleteFileAction(_: ActionState, form: FormData): Promise<ActionState> {
  const { user } = await requireSession();
  return attempt(() => files.deleteFile(user.id, field(form, "fileId")));
}
