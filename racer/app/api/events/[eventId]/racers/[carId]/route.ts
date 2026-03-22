import { NextResponse } from "next/server";
import { ensureDatabaseSchema, turso } from "@/lib/turso";

const TRACK_LENGTH_FT = 44;

type Params = { params: Promise<{ eventId: string; carId: string }> };

function toMph(timeMs: number): number {
  const miles = TRACK_LENGTH_FT / 5280;
  const hours = timeMs / 3_600_000;
  return miles / hours;
}

export async function GET(_request: Request, context: Params) {
  const { eventId, carId } = await context.params;

  await ensureDatabaseSchema();

  const carResult = await turso.execute({
    sql: `SELECT
            c.id AS car_id,
            c.car_number,
            c.car_name,
            c.registration_status,
            c.payment_amount,
            c.payment_status,
            c.checked_in_at,
            c.scratched_at,
            c.scratch_reason,
            r.display_name,
            r.first_name,
            r.last_name,
            r.age,
            d.id AS division_id,
            d.name AS division_name
          FROM cars c
          JOIN racers r ON r.id = c.racer_id
          JOIN divisions d ON d.id = c.division_id
          WHERE c.id = ? AND c.event_id = ?
          LIMIT 1`,
    args: [carId, eventId],
  });

  if (carResult.rows.length === 0) {
    return NextResponse.json({ error: "Racer not found." }, { status: 404 });
  }

  const row = carResult.rows[0];

  const car = {
    carId,
    carNumber: Number(row.car_number ?? 0),
    carName: String(row.car_name ?? ""),
    displayName: String(row.display_name ?? ""),
    firstName: String(row.first_name ?? ""),
    lastName: row.last_name != null ? String(row.last_name) : null,
    age: row.age != null ? Number(row.age) : null,
    divisionId: String(row.division_id ?? ""),
    divisionName: String(row.division_name ?? ""),
    registrationStatus: String(row.registration_status ?? ""),
    paymentAmount: Number(row.payment_amount ?? 0),
    paymentStatus: String(row.payment_status ?? "pay_later"),
    checkedInAt: row.checked_in_at != null ? String(row.checked_in_at) : null,
    scratchedAt: row.scratched_at != null ? String(row.scratched_at) : null,
    scratchReason: row.scratch_reason != null ? String(row.scratch_reason) : null,
  };

  const inspResult = await turso.execute({
    sql: `SELECT * FROM inspections WHERE car_id = ? LIMIT 1`,
    args: [carId],
  });

  const inspRow = inspResult.rows[0];
  const inspection = inspRow?.id
    ? {
        overallStatus: String(inspRow.overall_status ?? "pending"),
        weightOz: inspRow.weight_oz != null ? Number(inspRow.weight_oz) : null,
        lengthIn: inspRow.length_in != null ? Number(inspRow.length_in) : null,
        widthIn: inspRow.width_in != null ? Number(inspRow.width_in) : null,
        heightIn: inspRow.height_in != null ? Number(inspRow.height_in) : null,
        groundClearanceIn: inspRow.ground_clearance_in != null ? Number(inspRow.ground_clearance_in) : null,
        bodyMaterialStatus: inspRow.body_material_status != null ? String(inspRow.body_material_status) : null,
        wheelsStatus: inspRow.wheels_status != null ? String(inspRow.wheels_status) : null,
        axlesStatus: inspRow.axles_status != null ? String(inspRow.axles_status) : null,
        lubricantsStatus: inspRow.lubricants_status != null ? String(inspRow.lubricants_status) : null,
        inspectorName: inspRow.inspector_name != null ? String(inspRow.inspector_name) : null,
        inspectorNotes: inspRow.inspector_notes != null ? String(inspRow.inspector_notes) : null,
        inspectedAt: inspRow.inspected_at != null ? String(inspRow.inspected_at) : null,
        approvedAt: inspRow.approved_at != null ? String(inspRow.approved_at) : null,
      }
    : null;

  const racesResult = await turso.execute({
    sql: `SELECT
            r.race_number,
            r.round_number,
            r.group_number,
            p.phase_type,
            rl.lane_number,
            ralr.time_ms,
            ralr.result_code,
            ralr.place_in_attempt
          FROM race_attempt_lane_results ralr
          JOIN race_attempts ra ON ra.id = ralr.attempt_id
          JOIN races r ON r.id = ra.race_id
          JOIN race_lanes rl ON rl.race_id = r.id AND rl.car_id = ralr.car_id
          JOIN phases p ON p.id = r.phase_id
          WHERE ralr.car_id = ?
            AND p.event_id = ?
            AND ra.attempt_status = 'official'
          ORDER BY p.phase_type ASC, r.race_number ASC`,
    args: [carId, eventId],
  });

  const heats = racesResult.rows.map((r) => ({
    raceNumber: Number(r.race_number),
    roundNumber: r.round_number != null ? Number(r.round_number) : null,
    groupNumber: r.group_number != null ? Number(r.group_number) : null,
    phaseType: String(r.phase_type ?? "qualifying"),
    laneNumber: Number(r.lane_number),
    timeMs: r.time_ms != null ? Number(r.time_ms) : null,
    resultCode: String(r.result_code ?? ""),
    place: r.place_in_attempt != null ? Number(r.place_in_attempt) : null,
  }));

  const finishedTimes = heats
    .filter((h) => h.resultCode === "finished" && h.timeMs != null)
    .map((h) => h.timeMs!);

  const totalHeats = heats.length;
  const avgTimeMs = finishedTimes.length > 0
    ? Math.round(finishedTimes.reduce((a, b) => a + b, 0) / finishedTimes.length)
    : null;
  const bestTimeMs = finishedTimes.length > 0 ? Math.min(...finishedTimes) : null;
  const worstTimeMs = finishedTimes.length > 0 ? Math.max(...finishedTimes) : null;

  const topSpeedMph = bestTimeMs != null ? toMph(bestTimeMs) : null;
  const avgSpeedMph = avgTimeMs != null ? toMph(avgTimeMs) : null;

  let fasterThanPct: number | null = null;
  if (avgTimeMs != null) {
    const divisionResult = await turso.execute({
      sql: `SELECT
              ralr.car_id,
              AVG(ralr.time_ms) AS avg_time
            FROM race_attempt_lane_results ralr
            JOIN race_attempts ra ON ra.id = ralr.attempt_id
            JOIN races r ON r.id = ra.race_id
            JOIN phases p ON p.id = r.phase_id
            JOIN cars c ON c.id = ralr.car_id
            WHERE p.event_id = ?
              AND p.phase_type = 'qualifying'
              AND ra.attempt_status = 'official'
              AND ralr.result_code = 'finished'
              AND ralr.time_ms IS NOT NULL
              AND c.division_id = ?
            GROUP BY ralr.car_id`,
      args: [eventId, car.divisionId],
    });

    const allAvgs = divisionResult.rows.map((r) => Number(r.avg_time));
    const totalCars = allAvgs.length;
    if (totalCars > 1) {
      const slower = allAvgs.filter((t) => t > avgTimeMs).length;
      fasterThanPct = Math.round((slower / (totalCars - 1)) * 100);
    }
  }

  return NextResponse.json({
    car,
    inspection,
    heats,
    stats: {
      totalHeats,
      avgTimeMs,
      bestTimeMs,
      worstTimeMs,
      topSpeedMph: topSpeedMph != null ? Math.round(topSpeedMph * 10) / 10 : null,
      avgSpeedMph: avgSpeedMph != null ? Math.round(avgSpeedMph * 10) / 10 : null,
      fasterThanPct,
      trackLengthFt: TRACK_LENGTH_FT,
    },
  });
}
