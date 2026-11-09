"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Alert, Button, Field } from "@/components/ui";
import { Divider, GoogleButton } from "@/components/google-button";

export function SignUpForm({ google }: { google: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const password = String(form.get("password"));
    if (password !== String(form.get("confirm"))) {
      setError("Passwords don't match.");
      return;
    }
    const email = String(form.get("email"));
    setPending(true);
    setError(null);
    const { error } = await authClient.signUp.email({
      name: String(form.get("name")).trim(),
      email,
      password,
      callbackURL: "/dashboard", // where the verification link lands
    });
    setPending(false);
    if (error) {
      setError(error.message ?? "Sign up failed.");
      return;
    }
    router.push(`/check-email?email=${encodeURIComponent(email)}`);
  }

  return (
    <div className="flex flex-col gap-4">
      {google && (
        <>
          <GoogleButton callbackURL="/dashboard" />
          <Divider />
        </>
      )}
      <form method="post" onSubmit={onSubmit} className="flex flex-col gap-4">
        {error && <Alert kind="error">{error}</Alert>}
        <Field label="Name" name="name" autoComplete="name" required maxLength={100} />
        <Field label="Email" name="email" type="email" autoComplete="email" required />
        <Field
          label="Password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          maxLength={128}
          placeholder="At least 8 characters"
        />
        <Field label="Confirm password" name="confirm" type="password" autoComplete="new-password" required />
        <Button type="submit" disabled={pending}>
          {pending ? "Creating account…" : "Create account"}
        </Button>
      </form>
    </div>
  );
}
