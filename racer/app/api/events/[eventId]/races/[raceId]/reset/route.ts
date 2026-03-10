import { NextResponse } from "next/server";
import { ensureDatabaseSchema, turso } from "@/lib/turso";

export async function POST(
  _request: Request,
  context: { params: Promise<{ eventId: string; raceId: string }> }
) {
  const { eventId, raceId } = await context.params;

  await ensureDatabaseSchema();

  const raceResult = await turso.execute({
    sql: `SELECT r.id, r.race_status, r.phase_id, r.official_attempt_id
          FROM races r
          JOIN phases p ON p.id = r.phase_id
          WHERE r.id = ? AND p.event_id = ?
          LIMIT 1`,
    args: [raceId, eventId],
  });

  if (raceResult.rows.length === 0) {
    return NextResponse.json({ error: "Race not found." }, { status: 404 });
  }

  const race = raceResult.rows[0];

  if (String(race.race_status) !== "finished") {
    return NextResponse.json(
      { error: "Only finished races can be reset." },
      { status: 409 }
    );
  }

  const phaseId = String(race.phase_id);

  try {
    if (race.official_attempt_id) {
      await turso.execute({
        sql: "UPDATE race_attempts SET attempt_status = 'superseded' WHERE id = ?",
        args: [String(race.official_attempt_id)],
      });
    }

    await turso.execute({
      sql: "UPDATE races SET race_status = 'pending', official_attempt_id = NULL WHERE id = ?",
      args: [raceId],
    });

    await turso.execute({
      sql: "UPDATE phases SET status = 'active' WHERE id = ?",
      args: [phaseId],
    });

    await turso.execute({
      sql: "UPDATE events SET status = 'qualifying' WHERE id = ?",
      args: [eventId],
    });

    return NextResponse.json({ message: "Race reset to pending." });
  } catch (error) {
    return NextResponse.json(
      { error: `Failed to reset race: ${String(error)}` },
      { status: 500 }
    );
  }
}
