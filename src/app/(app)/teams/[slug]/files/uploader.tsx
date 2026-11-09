"use client";

import { useCallback, useRef, useState } from "react";
import { completeUploadAction, startUploadAction } from "./actions";
import { formatBytes } from "@/lib/format";
import { Button } from "@/components/ui";

type Upload = { key: string; name: string; size: number; progress: number; state: "uploading" | "done" | "error"; message?: string };

const CONCURRENCY = 3;

function put(url: string, file: File, contentType: string, onProgress: (fraction: number) => void): Promise<void> {
  // XHR rather than fetch: fetch can't report upload progress.
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("content-type", contentType);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Storage returned ${xhr.status}`)));
    xhr.onerror = () => reject(new Error("Network error while uploading."));
    xhr.send(file);
  });
}

export function Uploader({ teamId, folderId, maxBytes }: { teamId: string; folderId: string | null; maxBytes: number }) {
  const input = useRef<HTMLInputElement>(null);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [dragging, setDragging] = useState(false);

  const update = (key: string, patch: Partial<Upload>) =>
    setUploads((list) => list.map((u) => (u.key === key ? { ...u, ...patch } : u)));

  const uploadOne = useCallback(
    async (file: File, key: string) => {
      try {
        if (file.size > maxBytes) throw new Error(`Larger than the ${formatBytes(maxBytes)} limit.`);
        const started = await startUploadAction(teamId, folderId, { name: file.name, size: file.size, type: file.type });
        if ("error" in started) throw new Error(started.error);
        await put(started.uploadUrl, file, started.contentType, (p) => update(key, { progress: p }));
        const done = await completeUploadAction(started.fileId);
        if ("error" in done) throw new Error(done.error);
        update(key, {
          state: "done",
          progress: 1,
          message: done.name !== file.name ? `Saved as "${done.name}"` : undefined,
        });
      } catch (e) {
        update(key, { state: "error", message: e instanceof Error ? e.message : "Upload failed." });
      }
    },
    [teamId, folderId, maxBytes],
  );

  async function uploadAll(list: FileList | null) {
    if (!list?.length) return;
    const batch = Array.from(list).map((file) => ({ file, key: `${Date.now()}-${Math.random()}` }));
    setUploads((prev) => [
      ...prev.filter((u) => u.state === "uploading"),
      ...batch.map(({ file, key }) => ({ key, name: file.name, size: file.size, progress: 0, state: "uploading" as const })),
    ]);
    const queue = [...batch];
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
        for (let next = queue.shift(); next; next = queue.shift()) await uploadOne(next.file, next.key);
      }),
    );
    if (input.current) input.current.value = "";
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        void uploadAll(e.dataTransfer.files);
      }}
      className={`rounded-lg border-2 border-dashed p-4 transition-colors ${dragging ? "border-zinc-900 bg-zinc-100 dark:border-zinc-100 dark:bg-zinc-900" : "border-zinc-300 dark:border-zinc-700"}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Drag files here, or choose them. Up to {formatBytes(maxBytes)} each.
        </p>
        <input
          ref={input}
          type="file"
          multiple
          className="sr-only"
          aria-label="Upload files"
          onChange={(e) => void uploadAll(e.currentTarget.files)}
        />
        <Button type="button" onClick={() => input.current?.click()}>
          Upload files
        </Button>
      </div>
      {uploads.length > 0 && (
        <ul className="mt-3 flex flex-col gap-2" aria-label="Uploads">
          {uploads.map((u) => (
            <li key={u.key} className="text-sm" data-testid="upload-row">
              <div className="flex justify-between gap-3">
                <span className="truncate">{u.name}</span>
                <span className={u.state === "error" ? "text-red-600" : "text-zinc-500"}>
                  {u.state === "uploading" && `${Math.round(u.progress * 100)}%`}
                  {u.state === "done" && (u.message ?? "Uploaded")}
                  {u.state === "error" && u.message}
                </span>
              </div>
              {u.state === "uploading" && (
                <div className="mt-1 h-1 overflow-hidden rounded bg-zinc-200 dark:bg-zinc-800">
                  <div className="h-full bg-zinc-900 dark:bg-zinc-100" style={{ width: `${u.progress * 100}%` }} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
