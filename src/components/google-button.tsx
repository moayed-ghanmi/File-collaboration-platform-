"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { Button } from "./ui";

export function GoogleButton({ callbackURL }: { callbackURL: string }) {
  const [pending, setPending] = useState(false);
  return (
    <Button
      type="button"
      variant="secondary"
      className="w-full"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        await authClient.signIn.social({ provider: "google", callbackURL });
        setPending(false);
      }}
    >
      <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4">
        <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.8-5.5 3.8-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.2 14.6 2.2 12 2.2 6.6 2.2 2.3 6.6 2.3 12s4.3 9.8 9.7 9.8c5.6 0 9.3-3.9 9.3-9.5 0-.6-.1-1.1-.2-1.6H12z" />
      </svg>
      Continue with Google
    </Button>
  );
}

export function Divider() {
  return (
    <div className="flex items-center gap-3 text-xs uppercase text-zinc-500">
      <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
      or
      <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
    </div>
  );
}
