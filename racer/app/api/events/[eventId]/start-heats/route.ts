import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { ensureDatabaseSchema, turso } from "@/lib/turso";

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export async function POST(
  _request: Request,
  context: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await context.params;

  await ensureDatabaseSchema();

  const eventResult = await turso.execute({
    sql: "SELECT id, name, status, lane_count FROM events WHERE id = ? LIMIT 1",
    args: [eventId],
  });

  if (eventResult.rows.length === 0) {
    return NextResponse.json({ error: "Event not found." }, { status: 404 });
  }

  const event = eventResult.rows[0];
  if (String(event.status) !== "registration") {
    return NextResponse.json(
      { error: "Event must be in registration status to start heats." },
      { status: 409 }
    );
  }

  const laneCount = Number(event.lane_count ?? 2);

  const divisionsResult = await turso.execute({
    sql: "SELECT id, name FROM divisions WHERE event_id = ? ORDER BY sort_order ASC",
    args: [eventId],
  });

  const divisions = divisionsResult.rows.map((row) => ({
    id: String(row.id ?? ""),
    name: String(row.name ?? ""),
  }));

  const carsResult = await turso.execute({
    sql: `SELECT c.id, c.car_number, c.division_id
          FROM cars c
          WHERE c.event_id = ? AND c.registration_status != 'scratched'
          ORDER BY c.car_number ASC`,
    args: [eventId],
  });

  const carsByDivision = new Map<string, { id: string; carNumber: number }[]>();
  for (const row of carsResult.rows) {
    const divId = String(row.division_id ?? "");
    if (!carsByDivision.has(divId)) carsByDivision.set(divId, []);
    carsByDivision.get(divId)!.push({
      id: String(row.id ?? ""),
      carNumber: Number(row.car_number ?? 0),
    });
  }

  const skippedDivisions: string[] = [];
  const divisionSummaries: { name: string; carCount: number; heatCount: number }[] = [];

  let globalRaceNumber = 0;
  let totalRaces = 0;

  try {
    for (let divIdx = 0; divIdx < divisions.length; divIdx++) {
      const division = divisions[divIdx];
      const cars = carsByDivision.get(division.id) ?? [];

      if (cars.length < laneCount) {
        skippedDivisions.push(
          `${division.name} (${cars.length} car${cars.length === 1 ? "" : "s"}, need ${laneCount})`
        );
        continue;
      }

      const shuffledCars = shuffle(cars);
      const N = shuffledCars.length;
      const heatCount = N;

      const phaseId = randomUUID();
      await turso.execute({
        sql: `INSERT INTO phases (id, event_id, division_id, phase_type, name, status, sort_order)
              VALUES (?, ?, ?, 'qualifying', ?, 'active', ?)`,
        args: [phaseId, eventId, division.id, `${division.name} — Qualifying`, divIdx],
      });

      for (let raceIdx = 0; raceIdx < heatCount; raceIdx++) {
        globalRaceNumber++;
        const raceId = randomUUID();

        await turso.execute({
          sql: `INSERT INTO races (id, phase_id, race_number, race_status)
                VALUES (?, ?, ?, 'pending')`,
          args: [raceId, phaseId, globalRaceNumber],
        });

        for (let lane = 0; lane < laneCount; lane++) {
          const carIndex = (raceIdx + lane) % N;
          const car = shuffledCars[carIndex];

          await turso.execute({
            sql: `INSERT INTO race_lanes (id, race_id, lane_number, car_id)
                  VALUES (?, ?, ?, ?)`,
            args: [randomUUID(), raceId, lane + 1, car.id],
          });
        }
      }

      totalRaces += heatCount;
      divisionSummaries.push({ name: division.name, carCount: N, heatCount });
    }

    if (totalRaces === 0) {
      return NextResponse.json(
        { error: `No divisions have enough cars (need ${laneCount} per lane). ${skippedDivisions.length > 0 ? `Skipped: ${skippedDivisions.join(", ")}` : ""}` },
        { status: 409 }
      );
    }

    await turso.execute({
      sql: "UPDATE events SET status = 'qualifying' WHERE id = ?",
      args: [eventId],
    });

    const summary = divisionSummaries
      .map((d) => `${d.name}: ${d.heatCount} heats (${d.carCount} cars)`)
      .join("; ");

    return NextResponse.json({
      message: `Generated ${totalRaces} total heats across ${laneCount} lanes. ${summary}.${skippedDivisions.length > 0 ? ` Skipped: ${skippedDivisions.join(", ")}.` : ""}`,
      totalRaces,
      divisions: divisionSummaries,
      skippedDivisions,
    });
  } catch (error) {
    return NextResponse.json(
      { error: `Failed to generate heats: ${String(error)}` },
      { status: 500 }
    );
  }
}
