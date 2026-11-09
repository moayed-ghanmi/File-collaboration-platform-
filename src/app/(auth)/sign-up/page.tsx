import { Suspense } from "react";
import { AuthSwitchLink } from "@/components/auth-switch-link";
import { connection } from "next/server";
import { googleEnabled } from "@/lib/env";
import { SignUpForm } from "./sign-up-form";

export const metadata = { title: "Create account · FileCollab" };

async function SignUpSection() {
  await connection();
  return <SignUpForm google={googleEnabled()} />;
}

export default function SignUpPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold">Create your account</h1>
      <p className="mt-1 mb-6 text-sm text-zinc-600 dark:text-zinc-400">
        Already have one?{" "}
        <AuthSwitchLink href="/sign-in">
          Sign in
        </AuthSwitchLink>
      </p>
      <Suspense>
        <SignUpSection />
      </Suspense>
    </>
  );
}
