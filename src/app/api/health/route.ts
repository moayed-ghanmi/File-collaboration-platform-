import { connection } from "next/server";
import { HeadBucketCommand } from "@aws-sdk/client-s3";
import { db } from "@/lib/db";
import { redis } from "@/lib/redis";
import { s3 } from "@/lib/storage";
import { env } from "@/lib/env";
import { runHealthChecks } from "@/lib/health";

export async function GET() {
  await connection(); // always run at request time, never prerender

  const result = await runHealthChecks({
    database: () => db().$queryRaw`SELECT 1`,
    redis: async () => {
      const r = redis();
      if (r.status === "wait") await r.connect();
      const pong = await r.ping();
      if (pong !== "PONG") throw new Error(`unexpected reply: ${pong}`);
    },
    storage: () => s3().send(new HeadBucketCommand({ Bucket: env().S3_BUCKET })),
  });

  return Response.json(result, { status: result.status === "ok" ? 200 : 503 });
}
