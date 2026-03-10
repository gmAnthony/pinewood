import { NextResponse } from "next/server";
import { ensureDatabaseSchema, turso } from "@/lib/turso";

export async function GET(
  _request: Request,
  context: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await context.params;

  await ensureDatabaseSchema();

  const results = await turso.execute({
    sql: `SELECT
            ralr.car_id,
            ralr.time_ms,
            r.race_number,
            p.division_id,
            d.name AS division_name,
            c.car_number,
            c.car_name,
            rac.display_name
          FROM race_attempt_lane_results ralr
          JOIN race_attempts ra ON ra.id = ralr.attempt_id
          JOIN races r ON r.id = ra.race_id
          JOIN phases p ON p.id = r.phase_id
          JOIN divisions d ON d.id = p.division_id
          JOIN cars c ON c.id = ralr.car_id
          JOIN racers rac ON rac.id = c.racer_id
          WHERE p.event_id = ?
            AND p.phase_type = 'qualifying'
            AND ra.attempt_status = 'official'
            AND ralr.result_code = 'finished'
            AND ralr.time_ms IS NOT NULL
          ORDER BY d.sort_order ASC, r.race_number ASC`,
    args: [eventId],
  });

  type HeatResult = { raceNumber: number; timeMs: number };

  type CarEntry = {
    carId: string;
    carNumber: number;
    carName: string;
    displayName: string;
    divisionId: string;
    divisionName: string;
    heats: HeatResult[];
  };

  const carMap = new Map<string, CarEntry>();

  for (const row of results.rows) {
    const carId = String(row.car_id);
    if (!carMap.has(carId)) {
      carMap.set(carId, {
        carId,
        carNumber: Number(row.car_number),
        carName: String(row.car_name ?? ""),
        displayName: String(row.display_name ?? ""),
        divisionId: String(row.division_id),
        divisionName: String(row.division_name ?? "Open"),
        heats: [],
      });
    }
    carMap.get(carId)!.heats.push({
      raceNumber: Number(row.race_number),
      timeMs: Number(row.time_ms),
    });
  }

  const divisionGroups = new Map<
    string,
    { divisionName: string; entries: CarEntry[] }
  >();

  for (const entry of carMap.values()) {
    if (!divisionGroups.has(entry.divisionId)) {
      divisionGroups.set(entry.divisionId, {
        divisionName: entry.divisionName,
        entries: [],
      });
    }
    divisionGroups.get(entry.divisionId)!.entries.push(entry);
  }

  const divisions = [...divisionGroups.values()].map((group) => {
    const entries = group.entries
      .map((e) => {
        const totalMs = e.heats.reduce((sum, h) => sum + h.timeMs, 0);
        const averageTimeMs = Math.round(totalMs / e.heats.length);
        return { ...e, averageTimeMs };
      })
      .sort((a, b) => a.averageTimeMs - b.averageTimeMs)
      .map((e, i) => ({ ...e, seed: i + 1 }));

    return { divisionName: group.divisionName, entries };
  });

  return NextResponse.json({ divisions });
}
