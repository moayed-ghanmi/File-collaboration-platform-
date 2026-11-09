"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Alert, Button, Field } from "@/components/ui";

function ResetForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (!token || params.get("error")) {
    return (
      <div className="flex flex-col gap-4">
        <Alert kind="error">This reset link is invalid or has expired.</Alert>
        <Link href="/forgot-password" className="text-center text-sm underline">
          Request a new link
        </Link>
      </div>
    );
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const newPassword = String(form.get("password"));
    if (newPassword !== String(form.get("confirm"))) {
      setError("Passwords don't match.");
      return;
    }
    setPending(true);
    setError(null);
    const { error } = await authClient.resetPassword({ newPassword, token: token! });
    setPending(false);
    if (error) {
      setError(error.message ?? "Couldn't reset your password.");
      return;
    }
    router.replace("/sign-in?reset=1");
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {error && <Alert kind="error">{error}</Alert>}
      <Field
        label="New password"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        minLength={8}
        maxLength={128}
      />
      <Field label="Confirm new password" name="confirm" type="password" autoComplete="new-password" required />
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Set new password"}
      </Button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <>
      <h1 className="mb-6 text-2xl font-semibold">Choose a new password</h1>
      <Suspense>
        <ResetForm />
      </Suspense>
    </>
  );
}
