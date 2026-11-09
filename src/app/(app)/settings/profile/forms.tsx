"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Alert, Button, Field } from "@/components/ui";

type Status = { kind: "error" | "success"; text: string } | null;

export function ProfileForm({ name, email, emailVerified }: { name: string; email: string; emailVerified: boolean }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    const { error } = await authClient.updateUser({
      name: String(new FormData(e.currentTarget).get("name")).trim(),
    });
    setPending(false);
    setStatus(error ? { kind: "error", text: error.message ?? "Update failed." } : { kind: "success", text: "Profile saved." });
    if (!error) router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {status && <Alert kind={status.kind}>{status.text}</Alert>}
      <Field label="Name" name="name" defaultValue={name} required maxLength={100} />
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Email</span>
        <p className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
          {email}
          <span
            className={`rounded-full px-2 py-0.5 text-xs ${emailVerified ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300" : "bg-amber-100 text-amber-800"}`}
          >
            {emailVerified ? "Verified" : "Unverified"}
          </span>
        </p>
      </div>
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}

export function ChangePasswordForm() {
  const [status, setStatus] = useState<Status>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    const newPassword = String(form.get("newPassword"));
    if (newPassword !== String(form.get("confirm"))) {
      setStatus({ kind: "error", text: "New passwords don't match." });
      return;
    }
    setPending(true);
    const { error } = await authClient.changePassword({
      currentPassword: String(form.get("currentPassword")),
      newPassword,
      revokeOtherSessions: true,
    });
    setPending(false);
    if (error) {
      setStatus({ kind: "error", text: error.message ?? "Couldn't change password." });
      return;
    }
    formEl.reset();
    setStatus({ kind: "success", text: "Password changed." });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {status && <Alert kind={status.kind}>{status.text}</Alert>}
      <Field label="Current password" name="currentPassword" type="password" autoComplete="current-password" required />
      <Field
        label="New password"
        name="newPassword"
        type="password"
        autoComplete="new-password"
        required
        minLength={8}
        maxLength={128}
      />
      <Field label="Confirm new password" name="confirm" type="password" autoComplete="new-password" required />
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Change password"}
        </Button>
      </div>
    </form>
  );
}

export function SignOutEverywhere() {
  const [status, setStatus] = useState<Status>(null);
  const [pending, setPending] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      {status && <Alert kind={status.kind}>{status.text}</Alert>}
      <div>
        <Button
          variant="danger"
          disabled={pending}
          onClick={async () => {
            setPending(true);
            const { error } = await authClient.revokeOtherSessions();
            setPending(false);
            setStatus(
              error
                ? { kind: "error", text: error.message ?? "Failed." }
                : { kind: "success", text: "Signed out on all other devices." },
            );
          }}
        >
          Sign out of all other devices
        </Button>
      </div>
    </div>
  );
}
