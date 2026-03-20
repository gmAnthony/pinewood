import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/session";
import { ensureDatabaseSchema, turso } from "@/lib/turso";

export async function POST(
  _request: Request,
  context: { params: Promise<{ eventId: string }> }
) {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await verifySessionToken(token) : null;

  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { eventId } = await context.params;
  if (!eventId) {
    return NextResponse.json({ error: "Missing eventId." }, { status: 400 });
  }

  await ensureDatabaseSchema();

  const existing = await turso.execute({
    sql: "SELECT id, status FROM events WHERE id = ? LIMIT 1",
    args: [eventId],
  });
  if (existing.rows.length === 0) {
    return NextResponse.json({ error: "Event not found." }, { status: 404 });
  }

  await turso.execute({
    sql: "UPDATE events SET status = 'registration' WHERE id = ?",
    args: [eventId],
  });

  return NextResponse.json({ message: "Registration started.", eventId, status: "registration" });
}
