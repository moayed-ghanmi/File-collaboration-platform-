import { Suspense } from "react";
import Link from "next/link";
import { requireSession } from "@/lib/session";
import { SignOutButton } from "@/components/sign-out-button";

async function UserMenu() {
  const { user } = await requireSession();
  return (
    <div className="flex items-center gap-4">
      <Link href="/settings/profile" className="flex items-center gap-2 text-sm">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-200 text-xs font-semibold uppercase dark:bg-zinc-800">
          {user.name.slice(0, 1)}
        </span>
        <span data-testid="user-name">{user.name}</span>
      </Link>
      <SignOutButton />
    </div>
  );
}

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
          <nav className="flex items-center gap-6 text-sm">
            <Link href="/dashboard" className="text-base font-semibold">
              FileCollab
            </Link>
            <Link href="/dashboard" className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">
              Dashboard
            </Link>
            <Link href="/settings/profile" className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">
              Profile
            </Link>
          </nav>
          <Suspense fallback={<div className="h-7 w-32 animate-pulse rounded bg-zinc-100 dark:bg-zinc-900" />}>
            <UserMenu />
          </Suspense>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">{children}</main>
    </div>
  );
}
