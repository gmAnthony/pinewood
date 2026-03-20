import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/session";
import { ensureDatabaseSchema, turso } from "@/lib/turso";

type CreateRaceBody = {
  eventName?: string;
  divisionName?: string;
  raceName?: string;
  raceType?: "heat" | "tournament";
  raceNumber?: number;
  laneCount?: number;
};

function toSafeName(value: string, fallback: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await verifySessionToken(token) : null;

  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const body = (await request.json()) as CreateRaceBody;
  const eventName = toSafeName(body.eventName ?? "", "Race Day Event");
  const divisionName = toSafeName(body.divisionName ?? "", "Open Division");
  const raceName = toSafeName(body.raceName ?? "", "Race");
  const raceType = body.raceType === "tournament" ? "tournament" : "heat";
  const raceNumber = Number.isInteger(body.raceNumber) ? Number(body.raceNumber) : 1;
  const laneCount = Number.isInteger(body.laneCount) ? Number(body.laneCount) : 4;

  if (raceNumber < 1) {
    return NextResponse.json({ error: "Race number must be 1 or greater." }, { status: 400 });
  }

  if (laneCount < 1 || laneCount > 8) {
    return NextResponse.json({ error: "Lane count must be between 1 and 8." }, { status: 400 });
  }

  await ensureDatabaseSchema();

  const eventId = randomUUID();
  const divisionId = randomUUID();
  const phaseId = randomUUID();
  const raceId = randomUUID();
  const phaseType = raceType === "tournament" ? "tournament" : "qualifying";
  const tournamentFormat = raceType === "tournament" ? "single_elimination" : null;
  const seedingMethod = raceType === "heat" ? "best_time" : null;

  try {
    await turso.batch(
      [
        {
          sql: "INSERT INTO events (id, name, status) VALUES (?, ?, ?)",
          args: [eventId, eventName, "registration"],
        },
        {
          sql: "INSERT INTO divisions (id, event_id, name, sort_order) VALUES (?, ?, ?, 0)",
          args: [divisionId, eventId, divisionName],
        },
        {
          sql: `INSERT INTO phases (
              id,
              event_id,
              division_id,
              phase_type,
              name,
              status,
              tournament_format,
              seeding_method,
              sort_order
            ) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, 0)`,
          args: [phaseId, eventId, divisionId, phaseType, raceName, tournamentFormat, seedingMethod],
        },
        {
          sql: `INSERT INTO races (
              id,
              phase_id,
              race_number,
              race_status,
              notes
            ) VALUES (?, ?, ?, 'pending', ?)`,
          args: [raceId, phaseId, raceNumber, `Created by ${session.email}`],
        },
      ],
      "write"
    );

    for (let lane = 1; lane <= laneCount; lane += 1) {
      await turso.execute({
        sql: "INSERT INTO race_lanes (id, race_id, lane_number) VALUES (?, ?, ?)",
        args: [randomUUID(), raceId, lane],
      });
    }

    return NextResponse.json({
      message: `${raceType === "heat" ? "Heat" : "Tournament"} race created and configured.`,
      eventId,
      divisionId,
      phaseId,
      raceId,
      raceType,
    });
  } catch (error) {
    const details = String(error);
    return NextResponse.json({ error: `Failed to create race: ${details}` }, { status: 500 });
  }
}
