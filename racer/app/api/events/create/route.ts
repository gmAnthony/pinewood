import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/session";
import { ensureDatabaseSchema, turso } from "@/lib/turso";

type CreateEventBody = {
  eventName?: string;
  divisions?: string[];
  isPublic?: boolean;
};

function sanitizeName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await verifySessionToken(token) : null;

  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const body = (await request.json()) as CreateEventBody;
  const eventName = sanitizeName(body.eventName ?? "");
  const incomingDivisions = Array.isArray(body.divisions) ? body.divisions : [];
  const isPublic = body.isPublic === true ? 1 : 0;

  if (!eventName) {
    return NextResponse.json({ error: "Event name is required." }, { status: 400 });
  }

  const uniqueDivisions: string[] = [];
  const seen = new Set<string>();

  for (const division of incomingDivisions) {
    const sanitized = sanitizeName(division ?? "");
    if (!sanitized) {
      continue;
    }
    const key = sanitized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    uniqueDivisions.push(sanitized);
  }

  if (uniqueDivisions.length === 0) {
    return NextResponse.json(
      { error: "At least one division is required." },
      { status: 400 }
    );
  }

  await ensureDatabaseSchema();

  const eventId = randomUUID();
  const divisionRecords = uniqueDivisions.map((name, index) => ({
    id: randomUUID(),
    name,
    sortOrder: index,
  }));

  try {
    await turso.execute({
      sql: "INSERT INTO events (id, name, is_public, status) VALUES (?, ?, ?, 'setup')",
      args: [eventId, eventName, isPublic],
    });

    for (const division of divisionRecords) {
      await turso.execute({
        sql: "INSERT INTO divisions (id, event_id, name, sort_order) VALUES (?, ?, ?, ?)",
        args: [division.id, eventId, division.name, division.sortOrder],
      });
    }

    return NextResponse.json({
      message: `Created event and ${divisionRecords.length} divisions. Start registration when you're ready.`,
      eventId,
      eventName,
      isPublic: isPublic === 1,
      divisions: divisionRecords.map(({ id, name, sortOrder }) => ({
        id,
        name,
        sortOrder,
      })),
    });
  } catch (error) {
    const details = String(error);
    return NextResponse.json({ error: `Failed to create event: ${details}` }, { status: 500 });
  }
}
