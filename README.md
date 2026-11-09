# FileCollab

A file collaboration SaaS with real-time syncing and team management.

**Stack:** Next.js 16 · TypeScript · Tailwind · PostgreSQL + Prisma 7 · Redis · S3 (RustFS locally) · Better Auth

## Getting started

Requires Node 24+, pnpm and Docker.

```bash
cp .env.example .env
docker compose up -d          # Postgres, Redis, RustFS (S3) + bucket creation, Mailpit
pnpm install
pnpm db:migrate               # apply database migrations
pnpm dev                      # http://localhost:3000
```

Storage console: http://localhost:9001 (filecollab / filecollab-secret). Any
S3-compatible service works in production — just change the `S3_*` variables.

Local email inbox (Mailpit): http://localhost:8025. Verification and password-reset
emails land there. In production, point the `SMTP_*` variables at a real provider
and set `BETTER_AUTH_SECRET` (`openssl rand -base64 32`) and `BETTER_AUTH_URL`.

**Google sign-in (optional):** create an OAuth client in Google Cloud Console with the
redirect URI `http://localhost:3000/api/auth/callback/google` (use your production
domain in production), then set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. The
"Continue with Google" button only appears when both are set.

## Scripts

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Start the dev server |
| `pnpm build` | Production build |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | Generate route types and run `tsc` |
| `pnpm test` | Unit + auth integration tests (Vitest; needs Postgres migrated) |
| `pnpm test:e2e` | Browser tests (Playwright; needs `docker compose up -d`) |
| `pnpm db:migrate` | Create/apply Prisma migrations |

## Phase 0 — how to test

1. `docker compose up -d`, then `docker compose ps -a`: postgres and redis are `healthy`,
   storage is `Up`, and storage-init has `Exited (0)` (bucket created).
2. `pnpm db:migrate`, then `pnpm dev`.
3. `curl -i http://localhost:3000/api/health` should return `200` with
   `"status":"ok"` and `database`, `redis` and `storage` all `"ok": true`.
4. `docker compose stop redis` and curl again: you should get `503` with
   `"status":"degraded"` and `redis.ok: false`. Then run `docker compose start redis`.
5. Run `pnpm lint && pnpm typecheck && pnpm test && pnpm build` and confirm everything passes. CI runs the same checks on every PR.

## Phase 1 — how to test (authentication & accounts)

1. `docker compose up -d && pnpm db:migrate && pnpm dev`, then open http://localhost:3000.
2. Visit http://localhost:3000/dashboard while signed out: you are redirected to `/sign-in`.
3. **Sign up** with a name, email and password (8+ characters). You are asked to verify
   your email; open http://localhost:8025, click the link, and you land on the dashboard.
4. **Sign out**, then **sign in** again. A wrong password shows an error; signing in
   before verifying resends the verification email.
5. **Forgot password:** request a reset on `/forgot-password`, open the email in Mailpit,
   set a new password, and sign in with it. The old password no longer works.
6. **Settings:** change your name on `/settings/profile`; it updates in the header.
7. `curl -i http://localhost:3000/api/me` returns `401` signed out; in the browser while
   signed in it returns your profile.
8. Automated: `pnpm test` (auth integration tests) and `pnpm test:e2e` (6 Playwright
   flows: protected pages, protected API, sign-up + verification + sign-out/in, password
   reset, invalid reset link, rate limiting). Run `pnpm exec playwright install chromium` once first.

## Phase 2 — how to test (teams & members)

Roles: **Owner** (everything, incl. deleting the team), **Admin** (invite; manage members
and viewers), **Member**, **Viewer**. A team always keeps at least one owner.

1. `pnpm db:migrate`, `pnpm dev`, then sign up and verify two users (A and B), using two
   browsers or a private window. Mail arrives in Mailpit at http://localhost:8025.
2. As A, create a team on the dashboard. You land on `/teams/<slug>` as its owner.
3. Invite B's email as Member. The invitation appears under "Pending invitations".
4. As B, either click the link in the email (signed-out users go through sign-in or
   sign-up and come back to the invitation) or accept it from the dashboard. B now sees
   the team as a member without invite/remove controls.
5. As A, change B's role with the dropdown, then remove B. B gets a 404 for the team.
6. As A, try "Leave team": it's refused because A is the only owner. "Delete team" works.
7. Edge cases: an invite link opened while signed in as a different email shows "Wrong
   account". Links are single-use and expire after 7 days. Re-inviting replaces the old link.
8. Automated: `pnpm test` (team permission tests in `src/lib/teams.integration.test.ts`)
   and `pnpm test:e2e` (`e2e/teams.spec.ts`).

## Phase 3 — how to test (files & folders)

Uploads go straight from the browser to storage using presigned URLs, so file bytes
never pass through the app server. That requires bucket **CORS** for the app's origin.
`docker compose up` sets it for `http://localhost:3000` and `:3100`. In production,
allow `PUT` and `GET` from your app's domain on the bucket, and set `S3_PUBLIC_ENDPOINT`
if browsers reach storage on a different URL than the server does.

1. `docker compose up -d` (re-run it so `storage-init` applies CORS), `pnpm db:migrate`, `pnpm dev`.
2. Open a team → **Files**. Upload several files (button or drag-and-drop). A progress
   bar shows per file. Uploading a name that already exists saves it as `name (2).ext`.
3. Create a folder, open it (breadcrumbs update), upload into it, rename and delete files.
4. Click a file name to download it.
5. Invite a second user as **Viewer**: they can browse and download, but see no upload,
   rename, delete or new-folder controls.
6. Delete a folder: everything inside is removed, including the stored objects (check
   the RustFS console at http://localhost:9001).
7. Automated: `pnpm test` (`src/lib/files.integration.test.ts` runs against real storage)
   and `pnpm test:e2e` (`e2e/files.spec.ts`).
