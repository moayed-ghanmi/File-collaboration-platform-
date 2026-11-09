"use client";

import { useState } from "react";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import { Alert, Button, Field } from "@/components/ui";

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const { error } = await authClient.requestPasswordReset({
      email: String(new FormData(e.currentTarget).get("email")),
      redirectTo: "/reset-password",
    });
    setPending(false);
    if (error) setError(error.message ?? "Something went wrong.");
    else setSent(true);
  }

  return (
    <>
      <h1 className="text-2xl font-semibold">Reset your password</h1>
      <p className="mt-1 mb-6 text-sm text-zinc-600 dark:text-zinc-400">
        Enter your email and we&apos;ll send you a reset link.
      </p>
      {sent ? (
        <Alert kind="success">If an account exists for that email, a reset link is on its way.</Alert>
      ) : (
        <form method="post" onSubmit={onSubmit} className="flex flex-col gap-4">
          {error && <Alert kind="error">{error}</Alert>}
          <Field label="Email" name="email" type="email" autoComplete="email" required />
          <Button type="submit" disabled={pending}>
            {pending ? "Sending…" : "Send reset link"}
          </Button>
        </form>
      )}
      <p className="mt-6 text-center text-sm">
        <Link href="/sign-in" className="underline">
          Back to sign in
        </Link>
      </p>
    </>
  );
}
