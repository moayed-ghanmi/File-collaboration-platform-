import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { googleEnabled } from "@/lib/env";
import { SignInForm } from "./sign-in-form";

export const metadata = { title: "Sign in · FileCollab" };

async function SignInSection() {
  await connection(); // read runtime env, not build-time env
  return <SignInForm google={googleEnabled()} />;
}

export default function SignInPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold">Sign in</h1>
      <p className="mt-1 mb-6 text-sm text-zinc-600 dark:text-zinc-400">
        New here?{" "}
        <Link href="/sign-up" className="font-medium text-zinc-900 underline dark:text-zinc-100">
          Create an account
        </Link>
      </p>
      <Suspense>
        <SignInSection />
      </Suspense>
    </>
  );
}
