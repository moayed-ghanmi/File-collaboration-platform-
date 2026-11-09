# FileCollab

A file collaboration SaaS with real-time syncing and team management.

**Stack:** Next.js 16 · TypeScript · Tailwind · PostgreSQL + Prisma 7 · Redis · S3 (MinIO locally)

## Getting started

Requires Node 24+, pnpm and Docker.

```bash
cp .env.example .env
docker compose up -d          # Postgres, Redis, MinIO (+ bucket creation)
pnpm install
pnpm db:migrate               # apply database migrations
pnpm dev                      # http://localhost:3000
```

MinIO console: http://localhost:9001 (minioadmin / minioadmin)

## Scripts

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Start the dev server |
| `pnpm build` | Production build |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | Generate route types and run `tsc` |
| `pnpm test` | Unit tests (Vitest) |
| `pnpm db:migrate` | Create/apply Prisma migrations |

## Phase 0 — how to test

1. `docker compose up -d`, then `docker compose ps`: postgres, redis and minio should be `healthy`.
2. `pnpm db:migrate`, then `pnpm dev`.
3. `curl -i http://localhost:3000/api/health` should return `200` with
   `"status":"ok"` and `database`, `redis` and `storage` all `"ok": true`.
4. `docker compose stop redis` and curl again: you should get `503` with
   `"status":"degraded"` and `redis.ok: false`. Then run `docker compose start redis`.
5. Run `pnpm lint && pnpm typecheck && pnpm test && pnpm build` and confirm everything passes. CI runs the same checks on every PR.
