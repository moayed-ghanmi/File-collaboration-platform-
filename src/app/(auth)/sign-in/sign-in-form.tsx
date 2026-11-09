"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { safeRedirect } from "@/lib/safe-redirect";
import { Alert, Button, Field } from "@/components/ui";
import { Divider, GoogleButton } from "@/components/google-button";

export function SignInForm({ google }: { google: boolean }) {
  const params = useSearchParams();
  const next = safeRedirect(params.get("next"));
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(
    params.get("reset") ? "Your password was changed. Sign in with your new password." : null,
  );
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setPending(true);
    setError(null);
    setInfo(null);
    const { error } = await authClient.signIn.email({
      email: String(form.get("email")),
      password: String(form.get("password")),
      callbackURL: next,
    });
    setPending(false);
    if (error) {
      if (error.status === 403) {
        setInfo("Please verify your email first. We've sent you a new verification link.");
      } else {
        setError(error.status === 401 ? "Invalid email or password." : (error.message ?? "Sign in failed."));
      }
      return;
    }
    window.location.assign(next); // fresh load so every server component sees the new session
  }

  return (
    <div className="flex flex-col gap-4">
      {google && (
        <>
          <GoogleButton callbackURL={next} />
          <Divider />
        </>
      )}
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        {error && <Alert kind="error">{error}</Alert>}
        {info && <Alert kind="info">{info}</Alert>}
        <Field label="Email" name="email" type="email" autoComplete="email" required />
        <Field label="Password" name="password" type="password" autoComplete="current-password" required />
        <div className="-mt-2 text-right">
          <Link href="/forgot-password" className="text-sm text-zinc-600 underline dark:text-zinc-400">
            Forgot password?
          </Link>
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </div>
  );
}
