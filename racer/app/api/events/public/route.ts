import { NextResponse } from "next/server";
import { ensureDatabaseSchema, turso } from "@/lib/turso";

type PublicEvent = {
  id: string;
  name: string;
};

export async function GET() {
  await ensureDatabaseSchema();

  const result = await turso.execute(
    `SELECT id, name
     FROM events
     WHERE is_public = 1
     ORDER BY created_at DESC
     LIMIT 50`
  );

  const events: PublicEvent[] = result.rows.map((row) => ({
    id: String(row.id ?? ""),
    name: String(row.name ?? ""),
  }));

  return NextResponse.json({ events });
}
