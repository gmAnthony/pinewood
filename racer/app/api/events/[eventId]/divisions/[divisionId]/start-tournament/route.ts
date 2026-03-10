import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { ensureDatabaseSchema, turso } from "@/lib/turso";

function nextPowerOf2(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

function generateBracketOrder(size: number): number[] {
  if (size === 2) return [1, 2];
  const half = generateBracketOrder(size / 2);
  const result: number[] = [];
  for (const seed of half) {
    result.push(seed, size + 1 - seed);
  }
  return result;
}

export async function POST(
  _request: Request,
  context: {
    params: Promise<{ eventId: string; divisionId: string }>;
  }
) {
  const { eventId, divisionId } = await context.params;

  await ensureDatabaseSchema();

  const eventResult = await turso.execute({
    sql: "SELECT id, status, lane_count FROM events WHERE id = ? LIMIT 1",
    args: [eventId],
  });

  if (eventResult.rows.length === 0) {
    return NextResponse.json({ error: "Event not found." }, { status: 404 });
  }

  const existingTournament = await turso.execute({
    sql: `SELECT id FROM phases
          WHERE event_id = ? AND division_id = ? AND phase_type = 'tournament'
          LIMIT 1`,
    args: [eventId, divisionId],
  });

  if (existingTournament.rows.length > 0) {
    return NextResponse.json(
      { error: "Tournament already started for this division." },
      { status: 409 }
    );
  }

  const divResult = await turso.execute({
    sql: "SELECT id, name FROM divisions WHERE id = ? AND event_id = ? LIMIT 1",
    args: [divisionId, eventId],
  });

  if (divResult.rows.length === 0) {
    return NextResponse.json({ error: "Division not found." }, { status: 404 });
  }

  const divisionName = String(divResult.rows[0].name ?? "");

  const seedResults = await turso.execute({
    sql: `SELECT
            ralr.car_id,
            c.car_number,
            c.car_name,
            rac.display_name,
            AVG(ralr.time_ms) AS avg_time
          FROM race_attempt_lane_results ralr
          JOIN race_attempts ra ON ra.id = ralr.attempt_id
          JOIN races r ON r.id = ra.race_id
          JOIN phases p ON p.id = r.phase_id
          JOIN cars c ON c.id = ralr.car_id
          JOIN racers rac ON rac.id = c.racer_id
          WHERE p.event_id = ?
            AND p.division_id = ?
            AND p.phase_type = 'qualifying'
            AND ra.attempt_status = 'official'
            AND ralr.result_code = 'finished'
            AND ralr.time_ms IS NOT NULL
          GROUP BY ralr.car_id
          ORDER BY avg_time ASC`,
    args: [eventId, divisionId],
  });

  const seeds = seedResults.rows.map((row, i) => ({
    seed: i + 1,
    carId: String(row.car_id),
    carNumber: Number(row.car_number),
    carName: String(row.car_name ?? ""),
    displayName: String(row.display_name ?? ""),
    avgTime: Number(row.avg_time),
  }));

  if (seeds.length < 2) {
    return NextResponse.json(
      { error: "Need at least 2 qualifying cars to start a tournament." },
      { status: 409 }
    );
  }

  const N = seeds.length;
  const P = nextPowerOf2(N);
  const bracketOrder = generateBracketOrder(P);

  type BracketSlot = {
    groupNumber: number;
    seedA: number;
    seedB: number;
    isBye: boolean;
    byeCarId?: string;
    byeSeedNumber?: number;
  };

  const slots: BracketSlot[] = [];
  for (let i = 0; i < bracketOrder.length; i += 2) {
    const seedA = bracketOrder[i];
    const seedB = bracketOrder[i + 1];
    const groupNumber = i / 2 + 1;
    const isBye = seedB > N;

    const slot: BracketSlot = { groupNumber, seedA, seedB, isBye };
    if (isBye) {
      const byeSeed = seeds[seedA - 1];
      slot.byeCarId = byeSeed.carId;
      slot.byeSeedNumber = seedA;
    }
    slots.push(slot);
  }

  const seedByCarId = new Map(seeds.map((s) => [s.carId, s.seed]));

  const maxRaceNum = await turso.execute({
    sql: `SELECT COALESCE(MAX(r.race_number), 0) AS max_num
          FROM races r
          JOIN phases p ON p.id = r.phase_id
          WHERE p.event_id = ?`,
    args: [eventId],
  });
  let nextRaceNumber = Number(maxRaceNum.rows[0]?.max_num ?? 0);

  try {
    const phaseId = randomUUID();

    const bracketJson = JSON.stringify({
      bracketSize: P,
      totalSeeds: N,
      slots,
    });

    await turso.execute({
      sql: `INSERT INTO phases (id, event_id, division_id, phase_type, name, status, tournament_format, seeding_method, sort_order, bracket_json)
            VALUES (?, ?, ?, 'tournament', ?, 'active', 'single_elimination', 'average_time', 100, ?)`,
      args: [phaseId, eventId, divisionId, `${divisionName} — Tournament`, bracketJson],
    });

    let racesCreated = 0;

    for (const slot of slots) {
      if (slot.isBye) continue;

      const carA = seeds[slot.seedA - 1];
      const carB = seeds[slot.seedB - 1];

      nextRaceNumber++;
      const raceId = randomUUID();

      await turso.execute({
        sql: `INSERT INTO races (id, phase_id, race_number, round_number, group_number, race_status)
              VALUES (?, ?, ?, 1, ?, 'pending')`,
        args: [raceId, phaseId, nextRaceNumber, slot.groupNumber],
      });

      await turso.execute({
        sql: `INSERT INTO race_lanes (id, race_id, lane_number, car_id, seed_number)
              VALUES (?, ?, 1, ?, ?)`,
        args: [randomUUID(), raceId, carA.carId, seedByCarId.get(carA.carId) ?? null],
      });

      await turso.execute({
        sql: `INSERT INTO race_lanes (id, race_id, lane_number, car_id, seed_number)
              VALUES (?, ?, 2, ?, ?)`,
        args: [randomUUID(), raceId, carB.carId, seedByCarId.get(carB.carId) ?? null],
      });

      racesCreated++;
    }

    await turso.execute({
      sql: "UPDATE events SET status = 'tournament' WHERE id = ?",
      args: [eventId],
    });

    const byeCount = slots.filter((s) => s.isBye).length;
    const byeNames = slots
      .filter((s) => s.isBye)
      .map((s) => {
        const seed = seeds[s.seedA - 1];
        return `#${seed.carNumber} ${seed.displayName}`;
      });

    return NextResponse.json({
      message: `Tournament started for ${divisionName}. Bracket size: ${P}. Round 1: ${racesCreated} match${racesCreated !== 1 ? "es" : ""}${byeCount > 0 ? `, ${byeCount} bye${byeCount !== 1 ? "s" : ""} (${byeNames.join(", ")})` : ""}.`,
      phaseId,
      racesCreated,
      totalSeeds: N,
      bracketSize: P,
      byeCount,
    });
  } catch (error) {
    return NextResponse.json(
      { error: `Failed to start tournament: ${String(error)}` },
      { status: 500 }
    );
  }
}
