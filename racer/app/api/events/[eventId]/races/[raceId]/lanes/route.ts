import { NextResponse } from "next/server";
import { ensureDatabaseSchema, turso } from "@/lib/turso";

type LaneAssignment = {
  laneNumber: number;
  carId: string;
};

type PatchBody = {
  lanes: LaneAssignment[];
};

export async function PATCH(
  request: Request,
  context: { params: Promise<{ eventId: string; raceId: string }> }
) {
  const { eventId, raceId } = await context.params;

  await ensureDatabaseSchema();

  const raceResult = await turso.execute({
    sql: `SELECT r.id, r.race_status
          FROM races r
          JOIN phases p ON p.id = r.phase_id
          WHERE r.id = ? AND p.event_id = ?
          LIMIT 1`,
    args: [raceId, eventId],
  });

  if (raceResult.rows.length === 0) {
    return NextResponse.json({ error: "Race not found." }, { status: 404 });
  }

  if (String(raceResult.rows[0].race_status) === "finished") {
    return NextResponse.json(
      { error: "Cannot change lanes on a finished race." },
      { status: 409 }
    );
  }

  const body = (await request.json()) as PatchBody;

  if (!Array.isArray(body.lanes) || body.lanes.length === 0) {
    return NextResponse.json(
      { error: "Lane assignments are required." },
      { status: 400 }
    );
  }

  const existingLanes = await turso.execute({
    sql: "SELECT id, lane_number, car_id FROM race_lanes WHERE race_id = ? ORDER BY lane_number",
    args: [raceId],
  });

  const existingCarIds = new Set(
    existingLanes.rows.map((r) => String(r.car_id ?? ""))
  );
  const newCarIds = new Set(body.lanes.map((l) => l.carId));

  if (
    existingCarIds.size !== newCarIds.size ||
    ![...existingCarIds].every((id) => newCarIds.has(id))
  ) {
    return NextResponse.json(
      { error: "Lane reassignment must include the same set of cars." },
      { status: 400 }
    );
  }

  try {
    const laneRowIds = existingLanes.rows.map((r) => String(r.id));

    for (const id of laneRowIds) {
      await turso.execute({
        sql: "UPDATE race_lanes SET car_id = NULL WHERE id = ?",
        args: [id],
      });
    }

    for (const assignment of body.lanes) {
      const row = existingLanes.rows.find(
        (r) => Number(r.lane_number) === assignment.laneNumber
      );
      if (!row) continue;

      await turso.execute({
        sql: "UPDATE race_lanes SET car_id = ? WHERE id = ?",
        args: [assignment.carId, String(row.id)],
      });
    }

    return NextResponse.json({ message: "Lane assignments updated." });
  } catch (error) {
    return NextResponse.json(
      { error: `Failed to update lanes: ${String(error)}` },
      { status: 500 }
    );
  }
}
