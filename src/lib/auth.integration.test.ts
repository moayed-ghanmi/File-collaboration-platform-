import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { getAuth } from "./auth";
import { db } from "./db";
import { env } from "./env";
import { outbox } from "./mail";

// Exercises the real Better Auth handler against Postgres (no HTTP server).
const base = () => env().BETTER_AUTH_URL;
const email = `it-${Date.now()}@example.test`;
const password = "correct-horse-1";
const newPassword = "battery-staple-2";

async function call(path: string, init: { method?: string; body?: unknown; cookie?: string } = {}) {
  const headers = new Headers({ origin: base() });
  if (init.body) headers.set("content-type", "application/json");
  if (init.cookie) headers.set("cookie", init.cookie);
  const res = await getAuth().handler(
    new Request(`${base()}/api/auth${path}`, {
      method: init.method ?? (init.body ? "POST" : "GET"),
      headers,
      body: init.body ? JSON.stringify(init.body) : undefined,
      redirect: "manual",
    }),
  );
  return res;
}

function sessionCookie(res: Response): string | undefined {
  const raw = res.headers.getSetCookie().find((c) => c.includes("session_token="));
  return raw?.split(";")[0];
}

function lastLinkFor(to: string): URL {
  const mail = outbox.findLast((m) => m.to === to);
  if (!mail) throw new Error(`no email sent to ${to}`);
  const match = mail.text.match(/https?:\/\/\S+/);
  if (!match) throw new Error("no link in email");
  return new URL(match[0]);
}

describe("email + password auth", () => {
  beforeEach(() => {
    outbox.length = 0;
  });

  afterAll(async () => {
    await db().user.deleteMany({ where: { email } });
  });

  it("signs up without a session and sends a verification email", async () => {
    const res = await call("/sign-up/email", { body: { name: "Ada", email, password } });
    expect(res.status).toBe(200);
    expect(sessionCookie(res)).toBeUndefined();
    expect(outbox.at(-1)?.subject).toMatch(/verify/i);
  });

  it("rejects a duplicate sign-up without creating a second user", async () => {
    await call("/sign-up/email", { body: { name: "Ada 2", email, password } });
    expect(await db().user.count({ where: { email } })).toBe(1);
  });

  it("blocks sign-in until the email is verified", async () => {
    const res = await call("/sign-in/email", { body: { email, password } });
    expect(res.status).toBe(403);
  });

  it("verifies the email via the emailed link and signs the user in", async () => {
    await call("/sign-in/email", { body: { email, password } }); // re-sends link
    const link = lastLinkFor(email);
    const res = await call(link.pathname.replace("/api/auth", "") + link.search);
    expect([200, 302]).toContain(res.status);
    expect(sessionCookie(res)).toBeDefined();
    const user = await db().user.findUniqueOrThrow({ where: { email } });
    expect(user.emailVerified).toBe(true);
  });

  it("rejects a wrong password with 401", async () => {
    const res = await call("/sign-in/email", { body: { email, password: "wrong-password" } });
    expect(res.status).toBe(401);
  });

  it("signs in and resolves the session from the cookie", async () => {
    const res = await call("/sign-in/email", { body: { email, password } });
    expect(res.status).toBe(200);
    const cookie = sessionCookie(res);
    const session = await call("/get-session", { cookie });
    expect((await session.json()).user.email).toBe(email);
  });

  it("resets the password via the emailed link and revokes old sessions", async () => {
    const signIn = await call("/sign-in/email", { body: { email, password } });
    const oldCookie = sessionCookie(signIn);

    const req = await call("/request-password-reset", {
      body: { email, redirectTo: "/reset-password" },
    });
    expect(req.status).toBe(200);
    // Link looks like /api/auth/reset-password/<token>?callbackURL=...
    const token = lastLinkFor(email).pathname.split("/").pop();

    const reset = await call("/reset-password", { body: { token, newPassword } });
    expect(reset.status).toBe(200);

    expect((await call("/sign-in/email", { body: { email, password } })).status).toBe(401);
    expect((await call("/sign-in/email", { body: { email, password: newPassword } })).status).toBe(200);
    expect(await (await call("/get-session", { cookie: oldCookie })).json()).toBeNull();
  });

  it("does not reveal whether an email exists on password reset", async () => {
    const res = await call("/request-password-reset", {
      body: { email: "nobody@example.test", redirectTo: "/reset-password" },
    });
    expect(res.status).toBe(200);
    expect(outbox).toHaveLength(0);
  });
});
