import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { db } from "./db";
import { env, googleEnabled } from "./env";
import { sendMail } from "./mail";
import { resetPasswordEmail, verificationEmail } from "./emails";

function createAuth() {
  const e = env();
  return betterAuth({
    baseURL: e.BETTER_AUTH_URL,
    secret: e.BETTER_AUTH_SECRET,
    database: prismaAdapter(db(), { provider: "postgresql", transaction: true }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 8,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        await sendMail(resetPasswordEmail(user.email, user.name, url));
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) => {
        await sendMail(verificationEmail(user.email, user.name, url));
      },
    },
    socialProviders: googleEnabled()
      ? {
          google: {
            clientId: e.GOOGLE_CLIENT_ID!,
            clientSecret: e.GOOGLE_CLIENT_SECRET!,
          },
        }
      : {},
    session: {
      expiresIn: 60 * 60 * 24 * 30, // 30 days
      updateAge: 60 * 60 * 24, // extend at most once a day
    },
    plugins: [nextCookies()], // must stay last
  });
}

export type Auth = ReturnType<typeof createAuth>;

const globalForAuth = globalThis as unknown as { auth?: Auth };

// Built lazily so importing this module during `next build` needs no secrets.
export function getAuth(): Auth {
  globalForAuth.auth ??= createAuth();
  return globalForAuth.auth;
}
