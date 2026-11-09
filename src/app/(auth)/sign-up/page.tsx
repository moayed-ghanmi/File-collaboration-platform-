import { Suspense } from "react";
import Link from "next/link";
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
        <Link href="/sign-in" className="font-medium text-zinc-900 underline dark:text-zinc-100">
          Sign in
        </Link>
      </p>
      <Suspense>
        <SignUpSection />
      </Suspense>
    </>
  );
}
