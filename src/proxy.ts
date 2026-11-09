import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

// Optimistic check only (cookie present). Pages and APIs re-validate the
// session against the database before returning any data.
export function proxy(request: NextRequest) {
  if (getSessionCookie(request)) return NextResponse.next();

  const url = new URL("/sign-in", request.url);
  url.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/dashboard/:path*", "/settings/:path*", "/teams/:path*", "/invite/:path*"],
};
