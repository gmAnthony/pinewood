import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { ensureDatabaseSchema, turso } from "@/lib/turso";

type RegisterBody = {
  firstName?: string;
  lastName?: string;
  age?: number | null;
  carName?: string;
  divisionId?: string;
};

function sanitize(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export async function POST(
  request: Request,
  context: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await context.params;
  if (!eventId) {
    return NextResponse.json({ error: "Missing eventId." }, { status: 400 });
  }

  await ensureDatabaseSchema();

  const event = await turso.execute({
    sql: "SELECT id, name, status FROM events WHERE id = ? LIMIT 1",
    args: [eventId],
  });

  if (event.rows.length === 0) {
    return NextResponse.json({ error: "Event not found." }, { status: 404 });
  }

  if (String(event.rows[0].status) !== "registration") {
    return NextResponse.json(
      { error: "Event is not accepting registrations." },
      { status: 409 }
    );
  }

  const body = (await request.json()) as RegisterBody;
  const firstName = sanitize(body.firstName ?? "");
  const lastName = sanitize(body.lastName ?? "");
  const carName = sanitize(body.carName ?? "");
  const divisionId = (body.divisionId ?? "").trim();
  const age = typeof body.age === "number" && body.age > 0 ? body.age : null;

  if (!firstName) {
    return NextResponse.json({ error: "First name is required." }, { status: 400 });
  }
  if (!carName) {
    return NextResponse.json({ error: "Car name is required." }, { status: 400 });
  }
  if (!divisionId) {
    return NextResponse.json({ error: "Division is required." }, { status: 400 });
  }

  const division = await turso.execute({
    sql: "SELECT id FROM divisions WHERE id = ? AND event_id = ? LIMIT 1",
    args: [divisionId, eventId],
  });

  if (division.rows.length === 0) {
    return NextResponse.json({ error: "Invalid division." }, { status: 400 });
  }

  const displayName = lastName ? `${firstName} ${lastName}` : firstName;
  const racerId = randomUUID();
  const carId = randomUUID();

  const maxCarResult = await turso.execute({
    sql: "SELECT COALESCE(MAX(car_number), 0) AS max_num FROM cars WHERE event_id = ?",
    args: [eventId],
  });
  const nextCarNumber = Number(maxCarResult.rows[0]?.max_num ?? 0) + 1;

  try {
    await turso.execute({
      sql: `INSERT INTO racers (id, first_name, last_name, display_name, age)
            VALUES (?, ?, ?, ?, ?)`,
      args: [racerId, firstName, lastName || null, displayName, age],
    });

    await turso.execute({
      sql: `INSERT INTO cars (id, event_id, division_id, racer_id, car_number, car_name, registration_status)
            VALUES (?, ?, ?, ?, ?, ?, 'registered')`,
      args: [carId, eventId, divisionId, racerId, nextCarNumber, carName],
    });

    const inspectionId = randomUUID();
    await turso.execute({
      sql: `INSERT INTO inspections (id, car_id, overall_status)
            VALUES (?, ?, 'pending')`,
      args: [inspectionId, carId],
    });

    return NextResponse.json({
      message: `Registered ${displayName} with car #${nextCarNumber}.`,
      racer: { id: racerId, firstName, lastName, displayName, age },
      car: { id: carId, carNumber: nextCarNumber, carName, divisionId },
    });
  } catch (error) {
    return NextResponse.json(
      { error: `Registration failed: ${String(error)}` },
      { status: 500 }
    );
  }
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await context.params;
  if (!eventId) {
    return NextResponse.json({ error: "Missing eventId." }, { status: 400 });
  }

  await ensureDatabaseSchema();

  const result = await turso.execute({
    sql: `SELECT
            c.id AS car_id,
            c.car_number,
            c.car_name,
            c.registration_status,
            r.first_name,
            r.last_name,
            r.display_name,
            r.age,
            d.name AS division_name,
            i.overall_status AS inspection_status,
            i.weight_oz,
            i.length_in,
            i.width_in,
            i.height_in,
            i.ground_clearance_in,
            i.body_material_status,
            i.wheels_status,
            i.axles_status,
            i.lubricants_status
          FROM cars c
          JOIN racers r ON r.id = c.racer_id
          JOIN divisions d ON d.id = c.division_id
          LEFT JOIN inspections i ON i.car_id = c.id
          WHERE c.event_id = ?
          ORDER BY c.car_number ASC`,
    args: [eventId],
  });

  const registrations = result.rows.map((row) => {
    const checks = [
      row.weight_oz != null,
      row.length_in != null,
      row.width_in != null,
      row.height_in != null,
      row.ground_clearance_in != null,
      row.body_material_status != null,
      row.wheels_status != null,
      row.axles_status != null,
      row.lubricants_status != null,
    ];
    const completedChecks = checks.filter(Boolean).length;

    return {
      carId: String(row.car_id ?? ""),
      carNumber: Number(row.car_number ?? 0),
      carName: String(row.car_name ?? ""),
      registrationStatus: String(row.registration_status ?? ""),
      firstName: String(row.first_name ?? ""),
      lastName: String(row.last_name ?? ""),
      displayName: String(row.display_name ?? ""),
      age: row.age != null ? Number(row.age) : null,
      divisionName: String(row.division_name ?? ""),
      inspectionStatus: String(row.inspection_status ?? "pending"),
      inspectionProgress: { completed: completedChecks, total: checks.length },
    };
  });

  return NextResponse.json({ registrations });
}
