import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/session";
import { getFolderView } from "@/lib/files";
import { env } from "@/lib/env";
import { formatBytes } from "@/lib/format";
import { canEditFiles, ROLE_LABEL } from "@/lib/roles";
import { Card, Field } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { TeamTabs } from "../../tabs";
import { Uploader } from "../uploader";
import { ItemActions } from "../item-actions";
import { createFolderAction, deleteFileAction, deleteFolderAction, renameFileAction, renameFolderAction } from "../actions";

export const metadata = { title: "Files · FileCollab" };

const dateFmt = new Intl.DateTimeFormat("en", { dateStyle: "medium" });

async function FolderView({ params }: { params: PageProps<"/teams/[slug]/files/[[...folder]]">["params"] }) {
  const { slug, folder: segments } = await params;
  if (segments && segments.length > 1) notFound();
  const { user } = await requireSession();
  const view = await getFolderView(user.id, slug, segments?.[0] ?? null);
  if (!view) notFound();

  const { team, folder, breadcrumbs, folders, files, usage } = view;
  const editor = canEditFiles(team.role);
  const base = `/teams/${team.slug}/files`;
  const empty = folders.length === 0 && files.length === 0;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/dashboard" className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
          ← All teams
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">{team.name}</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          {usage.files} {usage.files === 1 ? "file" : "files"} · {formatBytes(usage.bytes)} used
          {!editor && ` · ${ROLE_LABEL[team.role]} (read-only)`}
        </p>
      </div>
      <TeamTabs slug={team.slug} active="files" />

      <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-sm">
        <Link href={base} className={folder ? "text-zinc-500 hover:underline" : "font-medium"}>
          All files
        </Link>
        {breadcrumbs.map((b, i) => (
          <span key={b.id} className="flex items-center gap-1">
            <span className="text-zinc-400">/</span>
            {i === breadcrumbs.length - 1 ? (
              <span className="font-medium" aria-current="page">
                {b.name}
              </span>
            ) : (
              <Link href={`${base}/${b.id}`} className="text-zinc-500 hover:underline">
                {b.name}
              </Link>
            )}
          </span>
        ))}
      </nav>

      {editor && (
        <div className="flex flex-col gap-3">
          <Uploader teamId={team.id} folderId={folder?.id ?? null} maxBytes={env().MAX_UPLOAD_BYTES} />
          <ActionForm action={createFolderAction} className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <input type="hidden" name="teamId" value={team.id} />
            {folder && <input type="hidden" name="parentId" value={folder.id} />}
            <div className="flex-1">
              <Field label="New folder" name="name" required maxLength={255} placeholder="Folder name" />
            </div>
            <SubmitButton variant="secondary" pendingText="Creating…">
              Create folder
            </SubmitButton>
          </ActionForm>
        </div>
      )}

      <Card title={folder ? folder.name : "All files"}>
        {empty ? (
          <p className="text-sm text-zinc-500">
            {editor ? "This folder is empty. Upload files or create a folder." : "This folder is empty."}
          </p>
        ) : (
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {folders.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5" data-testid="folder-row">
                <Link href={`${base}/${f.id}`} className="flex items-center gap-2 text-sm font-medium hover:underline">
                  <span aria-hidden>📁</span>
                  {f.name}
                </Link>
                {editor && (
                  <ItemActions
                    idField="folderId"
                    id={f.id}
                    name={f.name}
                    renameAction={renameFolderAction}
                    deleteAction={deleteFolderAction}
                    deleteConfirm={`Delete "${f.name}" and everything in it?`}
                  />
                )}
              </li>
            ))}
            {files.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5" data-testid="file-row">
                <div className="min-w-0">
                  <a
                    href={`/api/files/${f.id}/download`}
                    className="flex items-center gap-2 truncate text-sm font-medium hover:underline"
                    download
                  >
                    <span aria-hidden>📄</span>
                    {f.name}
                  </a>
                  <p className="text-xs text-zinc-500">
                    {formatBytes(f.size)} · {f.uploadedBy ?? "Deleted user"} · {dateFmt.format(f.createdAt)}
                  </p>
                </div>
                {editor && (
                  <ItemActions
                    idField="fileId"
                    id={f.id}
                    name={f.name}
                    renameAction={renameFileAction}
                    deleteAction={deleteFileAction}
                    deleteConfirm={`Delete "${f.name}"?`}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

export default function FilesPage({ params }: PageProps<"/teams/[slug]/files/[[...folder]]">) {
  return (
    <div className="mx-auto max-w-3xl">
      <Suspense fallback={<div className="h-96 animate-pulse rounded-lg bg-zinc-200 dark:bg-zinc-900" />}>
        <FolderView params={params} />
      </Suspense>
    </div>
  );
}
