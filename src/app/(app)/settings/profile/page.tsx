import { Suspense } from "react";
import { headers } from "next/headers";
import { getAuth } from "@/lib/auth";
import { requireSession } from "@/lib/session";
import { Card } from "@/components/ui";
import { ChangePasswordForm, ProfileForm, SignOutEverywhere } from "./forms";

export const metadata = { title: "Profile · FileCollab" };

async function Profile() {
  const { user } = await requireSession();
  const accounts = await getAuth().api.listUserAccounts({ headers: await headers() });
  const hasPassword = accounts.some((a) => a.providerId === "credential");
  const providers = accounts.map((a) => (a.providerId === "credential" ? "Email & password" : a.providerId));

  return (
    <div className="flex flex-col gap-6">
      <Card title="Profile" description="How you appear to your teammates.">
        <ProfileForm name={user.name} email={user.email} emailVerified={user.emailVerified} />
      </Card>
      <Card title="Password" description={hasPassword ? "Changing it signs you out on other devices." : undefined}>
        {hasPassword ? (
          <ChangePasswordForm />
        ) : (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            You sign in with {providers.join(", ")}. Use &ldquo;Forgot password&rdquo; on the sign-in page to add a
            password.
          </p>
        )}
      </Card>
      <Card title="Sessions" description={`Sign-in methods: ${providers.join(", ")}`}>
        <SignOutEverywhere />
      </Card>
    </div>
  );
}

export default function ProfilePage() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">Account settings</h1>
      <Suspense fallback={<div className="h-64 animate-pulse rounded-lg bg-zinc-200 dark:bg-zinc-900" />}>
        <Profile />
      </Suspense>
    </div>
  );
}
