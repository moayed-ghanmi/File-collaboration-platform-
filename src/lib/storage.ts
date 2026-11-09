import { S3Client } from "@aws-sdk/client-s3";
import { env } from "./env";

let client: S3Client | undefined;

export function s3(): S3Client {
  const e = env();
  client ??= new S3Client({
    endpoint: e.S3_ENDPOINT,
    region: e.S3_REGION,
    forcePathStyle: true, // required for MinIO
    credentials: {
      accessKeyId: e.S3_ACCESS_KEY_ID,
      secretAccessKey: e.S3_SECRET_ACCESS_KEY,
    },
  });
  return client;
}
