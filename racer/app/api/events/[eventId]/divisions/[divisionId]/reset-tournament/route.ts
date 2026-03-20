import { NextResponse } from "next/server";
import { ensureDatabaseSchema, turso } from "@/lib/turso";

export async function POST(
  _request: Request,
  context: {
    params: Promise<{ eventId: string; divisionId: string }>;
  }
) {
  const { eventId, divisionId } = await context.params;

  await ensureDatabaseSchema();

  const tournamentPhase = await turso.execute({
    sql: `SELECT id, status FROM phases
          WHERE event_id = ? AND division_id = ? AND phase_type = 'tournament'
          LIMIT 1`,
    args: [eventId, divisionId],
  });

  if (tournamentPhase.rows.length === 0) {
    return NextResponse.json({ error: "Tournament not found for this division." }, { status: 404 });
  }

  const phaseId = String(tournamentPhase.rows[0].id);

  try {
    await turso.execute({
      sql: "DELETE FROM phases WHERE id = ?",
      args: [phaseId],
    });

    await turso.execute({
      sql: "UPDATE events SET status = 'tournament' WHERE id = ?",
      args: [eventId],
    });

    return NextResponse.json({ message: "Tournament reset. You can start it again." });
  } catch (error) {
    return NextResponse.json(
      { error: `Failed to reset tournament: ${String(error)}` },
      { status: 500 }
    );
  }
}
