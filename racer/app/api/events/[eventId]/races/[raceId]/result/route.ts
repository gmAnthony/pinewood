import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { ensureDatabaseSchema, turso } from "@/lib/turso";

type LaneResult = {
  laneNumber: number;
  timeMs: number;
  resultCode?: "finished" | "dnf";
};

type ResultBody = {
  laneResults: LaneResult[];
};

export async function POST(
  request: Request,
  context: { params: Promise<{ eventId: string; raceId: string }> }
) {
  const { eventId, raceId } = await context.params;

  await ensureDatabaseSchema();

  const raceResult = await turso.execute({
    sql: `SELECT r.id, r.race_status, r.phase_id
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
  const status = String(race.race_status);

  if (status === "finished") {
    return NextResponse.json({ error: "Race already finished." }, { status: 409 });
  }

  const body = (await request.json()) as ResultBody;

  if (!Array.isArray(body.laneResults) || body.laneResults.length === 0) {
    return NextResponse.json({ error: "Lane results are required." }, { status: 400 });
  }

  const lanesResult = await turso.execute({
    sql: "SELECT lane_number, car_id FROM race_lanes WHERE race_id = ? ORDER BY lane_number",
    args: [raceId],
  });

  const laneCarMap = new Map<number, string>();
  for (const row of lanesResult.rows) {
    laneCarMap.set(Number(row.lane_number), String(row.car_id ?? ""));
  }

  const normalized = body.laneResults.map((lr) => ({
    laneNumber: lr.laneNumber,
    timeMs: lr.timeMs,
    resultCode: lr.resultCode === "dnf" ? "dnf" : "finished",
  }));

  const sorted = [...normalized].sort((a, b) => {
    const aFinished = a.resultCode === "finished";
    const bFinished = b.resultCode === "finished";
    if (aFinished !== bFinished) return aFinished ? -1 : 1;
    return a.timeMs - b.timeMs;
  });

  const existingAttempts = await turso.execute({
    sql: "SELECT COALESCE(MAX(attempt_number), 0) AS max_num FROM race_attempts WHERE race_id = ?",
    args: [raceId],
  });
  const nextAttemptNum = Number(existingAttempts.rows[0]?.max_num ?? 0) + 1;

  const attemptId = randomUUID();

  try {
    await turso.execute({
      sql: `INSERT INTO race_attempts (id, race_id, attempt_number, attempt_status, source)
            VALUES (?, ?, ?, 'official', 'manual')`,
      args: [attemptId, raceId, nextAttemptNum],
    });

    for (let i = 0; i < sorted.length; i++) {
      const lr = sorted[i];
      const carId = laneCarMap.get(lr.laneNumber) ?? null;

      await turso.execute({
        sql: `INSERT INTO race_attempt_lane_results
                (id, attempt_id, lane_number, car_id, result_code, time_ms, place_in_attempt)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [randomUUID(), attemptId, lr.laneNumber, carId, lr.resultCode, lr.timeMs, i + 1],
      });
    }

    await turso.execute({
      sql: "UPDATE races SET race_status = 'finished', official_attempt_id = ? WHERE id = ?",
      args: [attemptId, raceId],
    });

    const phaseId = String(race.phase_id);

    const phaseInfo = await turso.execute({
      sql: "SELECT phase_type FROM phases WHERE id = ? LIMIT 1",
      args: [phaseId],
    });
    const phaseType = String(phaseInfo.rows[0]?.phase_type ?? "qualifying");

    const phaseRemaining = await turso.execute({
      sql: "SELECT COUNT(*) AS cnt FROM races WHERE phase_id = ? AND race_status != 'finished'",
      args: [phaseId],
    });
    const phaseRemainingCount = Number(phaseRemaining.rows[0]?.cnt ?? 0);

    if (phaseType === "qualifying" && phaseRemainingCount === 0) {
      await turso.execute({
        sql: "UPDATE phases SET status = 'completed' WHERE id = ?",
        args: [phaseId],
      });
    }

    if (phaseType === "qualifying") {
      const allRemaining = await turso.execute({
        sql: `SELECT COUNT(*) AS cnt
              FROM races r
              JOIN phases p ON p.id = r.phase_id
              WHERE p.event_id = ? AND p.phase_type = 'qualifying' AND r.race_status != 'finished'`,
        args: [eventId],
      });
      const totalRemaining = Number(allRemaining.rows[0]?.cnt ?? 0);

      if (totalRemaining === 0) {
        await turso.execute({
          sql: "UPDATE events SET status = 'completed' WHERE id = ?",
          args: [eventId],
        });
      }

      return NextResponse.json({
        message: "Race finished.",
        attemptId,
        remainingRaces: totalRemaining,
      });
    }

    return NextResponse.json({
      message: "Race finished.",
      attemptId,
      roundComplete: phaseRemainingCount === 0,
      phaseId,
    });
  } catch (error) {
    return NextResponse.json(
      { error: `Failed to record result: ${String(error)}` },
      { status: 500 }
    );
  }
}
