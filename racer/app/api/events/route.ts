import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/session";
import { ensureDatabaseSchema, turso } from "@/lib/turso";

type EventSummary = {
  id: string;
  name: string;
  status: string;
  isPublic: boolean;
  trackLengthFt: number | null;
  createdAt: string;
  divisionCount: number;
};

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await verifySessionToken(token) : null;

  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  await ensureDatabaseSchema();

  const result = await turso.execute(
    `SELECT
      e.id,
      e.name,
      e.status,
      e.is_public,
      e.track_length_ft,
      e.created_at,
      COUNT(d.id) AS division_count
     FROM events e
     LEFT JOIN divisions d ON d.event_id = e.id
     GROUP BY e.id, e.name, e.status, e.is_public, e.track_length_ft, e.created_at
     ORDER BY e.created_at DESC
     LIMIT 100`
  );

  const events: EventSummary[] = result.rows.map((row) => ({
    id: String(row.id ?? ""),
    name: String(row.name ?? ""),
    status: String(row.status ?? "setup"),
    isPublic: Number(row.is_public ?? 0) === 1,
    trackLengthFt: row.track_length_ft != null ? Number(row.track_length_ft) : null,
    createdAt: String(row.created_at ?? ""),
    divisionCount: Number(row.division_count ?? 0),
  }));

  return NextResponse.json({ events });
}
