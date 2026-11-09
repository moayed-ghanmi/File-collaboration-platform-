"use client";

import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

const className = "font-medium text-zinc-900 underline dark:text-zinc-100";

function WithNext({ href, children }: { href: string; children: ReactNode }) {
  const next = useSearchParams().get("next");
  return (
    <Link href={next ? `${href}?next=${encodeURIComponent(next)}` : href} className={className}>
      {children}
    </Link>
  );
}

/** Link between sign-in and sign-up that keeps ?next=, so invite links survive the detour. */
export function AuthSwitchLink({ href, children }: { href: "/sign-in" | "/sign-up"; children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <Link href={href} className={className}>
          {children}
        </Link>
      }
    >
      <WithNext href={href}>{children}</WithNext>
    </Suspense>
  );
}
