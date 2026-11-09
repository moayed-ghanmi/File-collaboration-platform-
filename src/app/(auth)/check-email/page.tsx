"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Alert, Button } from "@/components/ui";

function CheckEmail() {
  const email = useSearchParams().get("email");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function resend() {
    if (!email) return;
    setStatus("sending");
    const { error } = await authClient.sendVerificationEmail({ email, callbackURL: "/dashboard" });
    setStatus(error ? "error" : "sent");
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        We sent a verification link to{" "}
        <strong className="text-zinc-900 dark:text-zinc-100">{email ?? "your email"}</strong>. Click it to
        activate your account. The link expires in 1 hour.
      </p>
      {status === "sent" && <Alert kind="success">A new link is on its way.</Alert>}
      {status === "error" && <Alert kind="error">Couldn&apos;t resend right now. Try again in a minute.</Alert>}
      {email && (
        <Button variant="secondary" onClick={resend} disabled={status === "sending"}>
          {status === "sending" ? "Sending…" : "Resend email"}
        </Button>
      )}
      <Link href="/sign-in" className="text-center text-sm underline">
        Back to sign in
      </Link>
    </div>
  );
}

export default function CheckEmailPage() {
  return (
    <>
      <h1 className="mb-4 text-2xl font-semibold">Check your email</h1>
      <Suspense>
        <CheckEmail />
      </Suspense>
    </>
  );
}
