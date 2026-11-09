"use client";

import { useState } from "react";
import { ActionForm, SubmitButton, type FormAction } from "@/components/action-form";
import { Button, Field } from "@/components/ui";

/** Rename (inline form) and delete controls for one file or folder row. */
export function ItemActions({
  idField,
  id,
  name,
  renameAction,
  deleteAction,
  deleteConfirm,
}: {
  idField: "fileId" | "folderId";
  id: string;
  name: string;
  renameAction: FormAction;
  deleteAction: FormAction;
  deleteConfirm: string;
}) {
  const [renaming, setRenaming] = useState(false);

  if (renaming) {
    return (
      <ActionForm
        action={async (state, form) => {
          const result = await renameAction(state, form);
          if (!result?.error) setRenaming(false);
          return result;
        }}
        className="flex items-end gap-2"
      >
        <input type="hidden" name={idField} value={id} />
        <Field label={`New name for ${name}`} name="name" defaultValue={name} required maxLength={255} autoFocus />
        <SubmitButton size="sm">Save</SubmitButton>
        <button type="button" onClick={() => setRenaming(false)} className="text-xs text-zinc-500 underline">
          Cancel
        </button>
      </ActionForm>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Button type="button" variant="secondary" size="sm" onClick={() => setRenaming(true)} aria-label={`Rename ${name}`}>
        Rename
      </Button>
      <ActionForm action={deleteAction} confirm={deleteConfirm}>
        <input type="hidden" name={idField} value={id} />
        <SubmitButton variant="danger" size="sm" aria-label={`Delete ${name}`}>
          Delete
        </SubmitButton>
      </ActionForm>
    </div>
  );
}
