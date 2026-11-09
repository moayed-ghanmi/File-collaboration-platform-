import { getAuth } from "@/lib/auth";

export async function GET(request: Request) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id, name, email, emailVerified, image, createdAt } = session.user;
  return Response.json({ user: { id, name, email, emailVerified, image, createdAt } });
}
