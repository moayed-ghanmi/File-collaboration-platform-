import { env } from "@/lib/env";

// Relays presigned requests to storage when browsers can't reach it directly
// (STORAGE_PROXY=true). It adds no credentials: storage still verifies the URL's
// signature, which was computed for S3_ENDPOINT's host and this exact path.

const FORWARD_REQUEST = ["content-type", "content-length"];
const FORWARD_RESPONSE = ["content-type", "content-length", "content-disposition", "etag", "last-modified"];

async function relay(request: Request, ctx: RouteContext<"/storage-proxy/[...path]">): Promise<Response> {
  const e = env();
  if (!e.STORAGE_PROXY) return new Response("Not found", { status: 404 });
  const { path } = await ctx.params;
  if (path[0] !== e.S3_BUCKET || path.length < 2) return new Response("Not found", { status: 404 });

  const target = new URL(`/${path.map(encodeURIComponent).join("/")}`, e.S3_ENDPOINT);
  target.search = new URL(request.url).search;

  const headers = new Headers();
  for (const h of FORWARD_REQUEST) {
    const v = request.headers.get(h);
    if (v) headers.set(h, v);
  }
  const upstream = await fetch(target, {
    method: request.method,
    headers,
    body: request.method === "PUT" ? request.body : undefined,
    // Required by Node's fetch to stream a request body.
    ...(request.method === "PUT" ? { duplex: "half" } : {}),
    redirect: "manual",
  } as RequestInit);

  const out = new Headers({ "cache-control": "no-store" });
  for (const h of FORWARD_RESPONSE) {
    const v = upstream.headers.get(h);
    if (v) out.set(h, v);
  }
  return new Response(upstream.body, { status: upstream.status, headers: out });
}

export const GET = relay;
export const PUT = relay;
