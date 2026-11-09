import { z } from "zod";

const optional = z
  .string()
  .optional()
  .transform((v) => (v ? v : undefined));

const schema = z.object({
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  S3_ENDPOINT: z.string().url(),
  S3_REGION: z.string().default("us-east-1"),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  S3_BUCKET: z.string().min(1),
  // Endpoint browsers use for presigned upload/download URLs, when it differs
  // from S3_ENDPOINT (e.g. the app reaches storage on an internal hostname).
  S3_PUBLIC_ENDPOINT: optional.pipe(z.string().url().optional()),
  // "true" when browsers can't reach storage at all (previews, tunnels): presigned
  // URLs then go through the app at /storage-proxy, which only relays signed requests.
  STORAGE_PROXY: z
    .string()
    .optional()
    .transform((v) => v === "true"),
  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(100 * 1024 * 1024),

  BETTER_AUTH_SECRET: z.string().min(32, "must be at least 32 characters"),
  BETTER_AUTH_URL: z.string().url(),
  // Extra comma-separated origins allowed to call auth endpoints, e.g. when a
  // tunnel or reverse proxy rewrites the browser's Origin header.
  BETTER_AUTH_TRUSTED_ORIGINS: z
    .string()
    .optional()
    .transform((v) => (v ?? "").split(",").map((s) => s.trim()).filter(Boolean)),
  GOOGLE_CLIENT_ID: optional,
  GOOGLE_CLIENT_SECRET: optional,

  // When SMTP_HOST is unset, emails are logged and kept in an in-memory outbox.
  SMTP_HOST: optional,
  SMTP_PORT: z.coerce.number().int().default(1025),
  SMTP_USER: optional,
  SMTP_PASSWORD: optional,
  EMAIL_FROM: z.string().default("FileCollab <no-reply@filecollab.local>"),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

// Parsed lazily so `next build` doesn't require runtime secrets.
export function env(): Env {
  cached ??= schema.parse(process.env);
  return cached;
}

export function googleEnabled(): boolean {
  const e = env();
  return Boolean(e.GOOGLE_CLIENT_ID && e.GOOGLE_CLIENT_SECRET);
}
