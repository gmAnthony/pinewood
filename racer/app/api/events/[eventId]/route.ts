import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/session";
import { ensureDatabaseSchema, turso } from "@/lib/turso";

type UpdateEventBody = {
  name?: string;
  isPublic?: boolean;
  trackLengthFt?: number | null;
};

function sanitizeName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

async function authorize() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await verifySessionToken(token) : null;
  return session;
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ eventId: string }> }
) {
  const session = await authorize();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { eventId } = await context.params;
  const body = (await request.json()) as UpdateEventBody;
  const name = sanitizeName(body.name ?? "");
  const isPublic = body.isPublic === true ? 1 : 0;
  const trackLengthFt =
    body.trackLengthFt != null && Number.isFinite(body.trackLengthFt) && body.trackLengthFt > 0
      ? body.trackLengthFt
      : null;

  if (!eventId) {
    return NextResponse.json({ error: "Missing eventId." }, { status: 400 });
  }

  if (!name) {
    return NextResponse.json({ error: "Event name is required." }, { status: 400 });
  }

  await ensureDatabaseSchema();

  const existing = await turso.execute({
    sql: "SELECT id FROM events WHERE id = ? LIMIT 1",
    args: [eventId],
  });
  if (existing.rows.length === 0) {
    return NextResponse.json({ error: "Event not found." }, { status: 404 });
  }

  await turso.execute({
    sql: "UPDATE events SET name = ?, is_public = ?, track_length_ft = ? WHERE id = ?",
    args: [name, isPublic, trackLengthFt, eventId],
  });

  return NextResponse.json({
    message: "Event updated.",
    event: { id: eventId, name, isPublic: isPublic === 1, trackLengthFt },
  });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ eventId: string }> }
) {
  const session = await authorize();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { eventId } = await context.params;
  if (!eventId) {
    return NextResponse.json({ error: "Missing eventId." }, { status: 400 });
  }

  await ensureDatabaseSchema();
  await turso.execute({
    sql: "DELETE FROM events WHERE id = ?",
    args: [eventId],
  });

  return NextResponse.json({ message: "Event deleted." });
}
