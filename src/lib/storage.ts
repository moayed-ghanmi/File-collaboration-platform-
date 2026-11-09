import "server-only";
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "./env";

let client: S3Client | undefined;
let publicClient: S3Client | undefined;

function makeClient(endpoint: string): S3Client {
  const e = env();
  return new S3Client({
    endpoint,
    region: e.S3_REGION,
    forcePathStyle: true, // required for MinIO/RustFS
    credentials: {
      accessKeyId: e.S3_ACCESS_KEY_ID,
      secretAccessKey: e.S3_SECRET_ACCESS_KEY,
    },
  });
}

export function s3(): S3Client {
  client ??= makeClient(env().S3_ENDPOINT);
  return client;
}

/** Client used only to sign URLs that the browser will call. */
function presignClient(): S3Client {
  const e = env();
  if (!e.S3_PUBLIC_ENDPOINT) return s3();
  publicClient ??= makeClient(e.S3_PUBLIC_ENDPOINT);
  return publicClient;
}

const URL_TTL_SECONDS = 15 * 60;

/** Presigned PUT. Content-Length is signed, so the browser can't upload a different size. */
export function presignUpload(key: string, contentType: string, size: number): Promise<string> {
  return getSignedUrl(
    presignClient(),
    new PutObjectCommand({ Bucket: env().S3_BUCKET, Key: key, ContentType: contentType, ContentLength: size }),
    { expiresIn: URL_TTL_SECONDS, signableHeaders: new Set(["content-type", "content-length"]) },
  );
}

export function presignDownload(key: string, filename: string, inline = false): Promise<string> {
  const disposition = `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(filename)}`;
  return getSignedUrl(
    presignClient(),
    new GetObjectCommand({ Bucket: env().S3_BUCKET, Key: key, ResponseContentDisposition: disposition }),
    { expiresIn: 60 },
  );
}

/** Object size in bytes, or null if it doesn't exist. */
export async function objectSize(key: string): Promise<number | null> {
  try {
    const head = await s3().send(new HeadObjectCommand({ Bucket: env().S3_BUCKET, Key: key }));
    return head.ContentLength ?? 0;
  } catch (e) {
    if (e instanceof Error && (e.name === "NotFound" || e.name === "NoSuchKey")) return null;
    throw e;
  }
}

export async function deleteObjects(keys: string[]): Promise<void> {
  for (let i = 0; i < keys.length; i += 1000) {
    await s3().send(
      new DeleteObjectsCommand({
        Bucket: env().S3_BUCKET,
        Delete: { Objects: keys.slice(i, i + 1000).map((Key) => ({ Key })), Quiet: true },
      }),
    );
  }
}

export async function deletePrefix(prefix: string): Promise<void> {
  let token: string | undefined;
  do {
    const page = await s3().send(
      new ListObjectsV2Command({ Bucket: env().S3_BUCKET, Prefix: prefix, ContinuationToken: token }),
    );
    const keys = (page.Contents ?? []).flatMap((o) => (o.Key ? [o.Key] : []));
    if (keys.length) await deleteObjects(keys);
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
}
