"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export function SignOutButton() {
  const [pending, setPending] = useState(false);
  return (
    <button
      type="button"
      disabled={pending}
      className="text-sm text-zinc-600 hover:text-zinc-900 disabled:opacity-60 dark:text-zinc-400 dark:hover:text-zinc-100"
      onClick={async () => {
        setPending(true);
        await authClient.signOut();
        // Full reload drops signed-in pages that the client router keeps in memory.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.assign("/sign-in");
      }}
    >
      Sign out
    </button>
  );
}
