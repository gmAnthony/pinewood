import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { ensureDatabaseSchema, turso } from "@/lib/turso";

type BracketSlot = {
  groupNumber: number;
  seedA: number;
  seedB: number;
  isBye: boolean;
  byeCarId?: string;
  byeSeedNumber?: number;
};

type BracketData = {
  bracketSize: number;
  totalSeeds: number;
  slots: BracketSlot[];
};

type Advancer = {
  carId: string;
  seedNumber: number | null;
  groupNumber: number;
};

export async function POST(
  request: Request,
  context: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await context.params;
  const body = (await request.json()) as { phaseId: string };

  if (!body.phaseId) {
    return NextResponse.json(
      { error: "phaseId is required." },
      { status: 400 }
    );
  }

  await ensureDatabaseSchema();

  const phaseResult = await turso.execute({
    sql: `SELECT id, division_id, status, bracket_json
          FROM phases
          WHERE id = ? AND event_id = ? AND phase_type = 'tournament'
          LIMIT 1`,
    args: [body.phaseId, eventId],
  });

  if (phaseResult.rows.length === 0) {
    return NextResponse.json(
      { error: "Tournament phase not found." },
      { status: 404 }
    );
  }

  const phase = phaseResult.rows[0];
  const phaseId = String(phase.id);
  const bracketData: BracketData | null = phase.bracket_json
    ? (JSON.parse(String(phase.bracket_json)) as BracketData)
    : null;

  const currentRoundResult = await turso.execute({
    sql: `SELECT COALESCE(MAX(round_number), 0) AS max_round
          FROM races WHERE phase_id = ?`,
    args: [phaseId],
  });
  const currentRound = Number(currentRoundResult.rows[0]?.max_round ?? 0);

  if (currentRound === 0) {
    return NextResponse.json(
      { error: "No races found in this tournament." },
      { status: 409 }
    );
  }

  const unfinishedResult = await turso.execute({
    sql: `SELECT COUNT(*) AS cnt FROM races
          WHERE phase_id = ? AND round_number = ? AND race_status != 'finished'`,
    args: [phaseId, currentRound],
  });

  if (Number(unfinishedResult.rows[0]?.cnt ?? 0) > 0) {
    return NextResponse.json(
      { error: "Current round is not yet complete." },
      { status: 409 }
    );
  }

  const roundRaces = await turso.execute({
    sql: `SELECT r.id, r.group_number, r.official_attempt_id
          FROM races r
          WHERE r.phase_id = ? AND r.round_number = ?
          ORDER BY r.group_number ASC`,
    args: [phaseId, currentRound],
  });

  const advancers: Advancer[] = [];

  if (currentRound === 1 && bracketData) {
    for (const slot of bracketData.slots) {
      if (slot.isBye && slot.byeCarId) {
        advancers.push({
          carId: slot.byeCarId,
          seedNumber: slot.byeSeedNumber ?? null,
          groupNumber: slot.groupNumber,
        });
      }
    }
  }

  for (const raceRow of roundRaces.rows) {
    const attemptId = raceRow.official_attempt_id;
    if (!attemptId) continue;
    const raceId = String(raceRow.id);

    const winnerResult = await turso.execute({
      sql: `SELECT car_id FROM race_attempt_lane_results
            WHERE attempt_id = ? AND place_in_attempt = 1
            LIMIT 1`,
      args: [String(attemptId)],
    });

    if (winnerResult.rows.length > 0) {
      const winnerCarId = String(winnerResult.rows[0].car_id);
      const seedLookup = await turso.execute({
        sql: "SELECT seed_number FROM race_lanes WHERE race_id = ? AND car_id = ? LIMIT 1",
        args: [raceId, winnerCarId],
      });
      advancers.push({
        carId: winnerCarId,
        seedNumber: seedLookup.rows[0]?.seed_number != null
          ? Number(seedLookup.rows[0].seed_number)
          : null,
        groupNumber: Number(raceRow.group_number ?? 0),
      });
    }
  }

  advancers.sort((a, b) => a.groupNumber - b.groupNumber);

  if (advancers.length <= 1) {
    await turso.execute({
      sql: "UPDATE phases SET status = 'completed' WHERE id = ?",
      args: [phaseId],
    });

    const allTournaments = await turso.execute({
      sql: `SELECT COUNT(*) AS cnt FROM phases
            WHERE event_id = ? AND phase_type = 'tournament' AND status != 'completed'`,
      args: [eventId],
    });

    if (Number(allTournaments.rows[0]?.cnt ?? 0) === 0) {
      await turso.execute({
        sql: "UPDATE events SET status = 'completed' WHERE id = ?",
        args: [eventId],
      });
    }

    const champion = advancers[0];
    return NextResponse.json({
      message: "Tournament complete!",
      championCarId: champion?.carId ?? null,
      tournamentDone: true,
    });
  }

  const nextRound = currentRound + 1;
  const N = advancers.length;

  if (N % 2 !== 0) {
    return NextResponse.json(
      { error: `Unexpected odd number of advancers (${N}). Bracket may be corrupted.` },
      { status: 500 }
    );
  }

  const maxRaceNum = await turso.execute({
    sql: `SELECT COALESCE(MAX(r.race_number), 0) AS max_num
          FROM races r
          JOIN phases p ON p.id = r.phase_id
          WHERE p.event_id = ?`,
    args: [eventId],
  });
  let nextRaceNumber = Number(maxRaceNum.rows[0]?.max_num ?? 0);

  try {
    let racesCreated = 0;

    for (let i = 0; i < N; i += 2) {
      const carA = advancers[i];
      const carB = advancers[i + 1];

      nextRaceNumber++;
      const groupNum = i / 2 + 1;
      const raceId = randomUUID();

      await turso.execute({
        sql: `INSERT INTO races (id, phase_id, race_number, round_number, group_number, race_status)
              VALUES (?, ?, ?, ?, ?, 'pending')`,
        args: [raceId, phaseId, nextRaceNumber, nextRound, groupNum],
      });

      await turso.execute({
        sql: `INSERT INTO race_lanes (id, race_id, lane_number, car_id, seed_number)
              VALUES (?, ?, 1, ?, ?)`,
        args: [randomUUID(), raceId, carA.carId, carA.seedNumber],
      });

      await turso.execute({
        sql: `INSERT INTO race_lanes (id, race_id, lane_number, car_id, seed_number)
              VALUES (?, ?, 2, ?, ?)`,
        args: [randomUUID(), raceId, carB.carId, carB.seedNumber],
      });

      racesCreated++;
    }

    return NextResponse.json({
      message: `Round ${nextRound}: ${racesCreated} match${racesCreated !== 1 ? "es" : ""} generated.`,
      round: nextRound,
      racesCreated,
      tournamentDone: false,
    });
  } catch (error) {
    return NextResponse.json(
      { error: `Failed to advance tournament: ${String(error)}` },
      { status: 500 }
    );
  }
}
