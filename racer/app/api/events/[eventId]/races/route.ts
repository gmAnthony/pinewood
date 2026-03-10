import { NextResponse } from "next/server";
import { ensureDatabaseSchema, turso } from "@/lib/turso";

export async function GET(
  _request: Request,
  context: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await context.params;

  await ensureDatabaseSchema();

  const phasesResult = await turso.execute({
    sql: `SELECT p.id, p.division_id, p.phase_type, p.name AS phase_name,
                 p.status AS phase_status, p.bracket_json, d.name AS division_name
          FROM phases p
          LEFT JOIN divisions d ON d.id = p.division_id
          WHERE p.event_id = ?
            AND p.phase_type IN ('qualifying', 'tournament')
            AND p.status IN ('active', 'completed')
          ORDER BY p.sort_order ASC`,
    args: [eventId],
  });

  if (phasesResult.rows.length === 0) {
    return NextResponse.json({ races: [], tournamentPhases: [] });
  }

  const phaseIds = phasesResult.rows.map((r) => String(r.id));

  type PhaseInfo = {
    divisionName: string;
    phaseType: string;
    divisionId: string;
    phaseStatus: string;
  };

  const phaseInfoMap = new Map<string, PhaseInfo>();
  for (const row of phasesResult.rows) {
    phaseInfoMap.set(String(row.id), {
      divisionName: String(row.division_name ?? "Open"),
      phaseType: String(row.phase_type),
      divisionId: String(row.division_id ?? ""),
      phaseStatus: String(row.phase_status ?? "active"),
    });
  }

  const phPlaceholders = phaseIds.map(() => "?").join(",");

  const racesResult = await turso.execute({
    sql: `SELECT id, phase_id, race_number, race_status, round_number, group_number
          FROM races
          WHERE phase_id IN (${phPlaceholders})
          ORDER BY race_number ASC`,
    args: phaseIds,
  });

  const raceIds = racesResult.rows.map((r) => String(r.id));

  if (raceIds.length === 0) {
    return NextResponse.json({ races: [], tournamentPhases: [] });
  }

  const racePlaceholders = raceIds.map(() => "?").join(",");

  const lanesResult = await turso.execute({
    sql: `SELECT
            rl.race_id,
            rl.lane_number,
            rl.car_id,
            rl.seed_number,
            c.car_number,
            c.car_name,
            r.display_name
          FROM race_lanes rl
          JOIN cars c ON c.id = rl.car_id
          JOIN racers r ON r.id = c.racer_id
          WHERE rl.race_id IN (${racePlaceholders})
          ORDER BY rl.lane_number ASC`,
    args: raceIds,
  });

  const resultsResult = await turso.execute({
    sql: `SELECT
            ra.race_id,
            ralr.lane_number,
            ralr.time_ms,
            ralr.result_code,
            ralr.place_in_attempt
          FROM race_attempts ra
          JOIN race_attempt_lane_results ralr ON ralr.attempt_id = ra.id
          WHERE ra.race_id IN (${racePlaceholders})
            AND ra.attempt_status = 'official'
          ORDER BY ralr.lane_number ASC`,
    args: raceIds,
  });

  type LaneInfo = {
    laneNumber: number;
    carId: string;
    carNumber: number;
    carName: string;
    displayName: string;
    seedNumber: number | null;
    timeMs: number | null;
    resultCode: string | null;
    place: number | null;
  };

  const lanesByRace = new Map<string, LaneInfo[]>();
  for (const row of lanesResult.rows) {
    const raceId = String(row.race_id);
    if (!lanesByRace.has(raceId)) lanesByRace.set(raceId, []);
    lanesByRace.get(raceId)!.push({
      laneNumber: Number(row.lane_number),
      carId: String(row.car_id ?? ""),
      carNumber: Number(row.car_number ?? 0),
      carName: String(row.car_name ?? ""),
      displayName: String(row.display_name ?? ""),
      seedNumber: row.seed_number != null ? Number(row.seed_number) : null,
      timeMs: null,
      resultCode: null,
      place: null,
    });
  }

  for (const row of resultsResult.rows) {
    const raceId = String(row.race_id);
    const laneNum = Number(row.lane_number);
    const lanes = lanesByRace.get(raceId);
    if (!lanes) continue;
    const lane = lanes.find((l) => l.laneNumber === laneNum);
    if (lane) {
      lane.timeMs = row.time_ms != null ? Number(row.time_ms) : null;
      lane.resultCode = row.result_code != null ? String(row.result_code) : null;
      lane.place = row.place_in_attempt != null ? Number(row.place_in_attempt) : null;
    }
  }

  const allRaces = racesResult.rows.map((row) => {
    const pId = String(row.phase_id);
    const info = phaseInfoMap.get(pId);
    return {
      id: String(row.id),
      phaseId: pId,
      raceNumber: Number(row.race_number),
      status: String(row.race_status),
      divisionName: info?.divisionName ?? "Open",
      phaseType: info?.phaseType ?? "qualifying",
      roundNumber: row.round_number != null ? Number(row.round_number) : null,
      groupNumber: row.group_number != null ? Number(row.group_number) : null,
      lanes: lanesByRace.get(String(row.id)) ?? [],
    };
  });

  const qualifyingRaces = allRaces.filter((r) => r.phaseType === "qualifying");
  const tournamentRaces = allRaces.filter((r) => r.phaseType === "tournament");

  type ByeInfo = {
    carId: string;
    seedNumber: number;
    carNumber?: number;
    displayName?: string;
    carName?: string;
  };

  const tournamentPhases = phasesResult.rows
    .filter((r) => String(r.phase_type) === "tournament")
    .map((row) => {
      let byes: ByeInfo[] = [];
      if (row.bracket_json) {
        try {
          const bracket = JSON.parse(String(row.bracket_json)) as {
            slots: { isBye: boolean; byeCarId?: string; byeSeedNumber?: number }[];
          };
          byes = bracket.slots
            .filter((s) => s.isBye && s.byeCarId)
            .map((s) => ({
              carId: s.byeCarId!,
              seedNumber: s.byeSeedNumber ?? 0,
            }));
        } catch {
          /* ignore parse errors */
        }
      }
      return {
        phaseId: String(row.id),
        divisionId: String(row.division_id ?? ""),
        divisionName: String(row.division_name ?? "Open"),
        phaseStatus: String(row.phase_status ?? "active"),
        byes,
      };
    });

  const qualifyingDivisions = phasesResult.rows
    .filter((r) => String(r.phase_type) === "qualifying")
    .map((row) => ({
      divisionId: String(row.division_id ?? ""),
      divisionName: String(row.division_name ?? "Open"),
    }));

  const allByeCarIds = tournamentPhases.flatMap((p) => p.byes.map((b) => b.carId));
  if (allByeCarIds.length > 0) {
    const byePlaceholders = allByeCarIds.map(() => "?").join(",");
    const byeCarInfo = await turso.execute({
      sql: `SELECT c.id, c.car_number, c.car_name, r.display_name
            FROM cars c JOIN racers r ON r.id = c.racer_id
            WHERE c.id IN (${byePlaceholders})`,
      args: allByeCarIds,
    });
    const byeCarMap = new Map(
      byeCarInfo.rows.map((r) => [
        String(r.id),
        {
          carNumber: Number(r.car_number ?? 0),
          carName: String(r.car_name ?? ""),
          displayName: String(r.display_name ?? ""),
        },
      ])
    );
    for (const phase of tournamentPhases) {
      for (const bye of phase.byes) {
        const info = byeCarMap.get(bye.carId);
        if (info) {
          bye.carNumber = info.carNumber;
          bye.displayName = info.displayName;
          bye.carName = info.carName;
        }
      }
    }
  }

  return NextResponse.json({
    races: qualifyingRaces,
    tournamentRaces,
    tournamentPhases,
    qualifyingDivisions,
  });
}
