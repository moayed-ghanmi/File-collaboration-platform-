import { getAuth } from "@/lib/auth";
import { downloadUrl, FileError } from "@/lib/files";

// Redirects to a short-lived presigned URL, so file bytes never pass through the app.
export async function GET(request: Request, ctx: RouteContext<"/api/files/[id]/download">) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  try {
    const url = await downloadUrl(session.user.id, id);
    return new Response(null, { status: 302, headers: { location: url, "cache-control": "no-store" } });
  } catch (e) {
    if (e instanceof FileError) return Response.json({ error: "not found" }, { status: 404 });
    throw e;
  }
}
