import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/session";
import { ensureDatabaseSchema, turso } from "@/lib/turso";

type RunRaceBody = {
  raceId?: string;
};

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const session = token ? verifySessionToken(token) : null;

  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const body = (await request.json()) as RunRaceBody;
  const raceId = body.raceId?.trim();

  if (!raceId) {
    return NextResponse.json({ error: "raceId is required." }, { status: 400 });
  }

  await ensureDatabaseSchema();

  const raceLookup = await turso.execute({
    sql: "SELECT id, phase_id, race_status FROM races WHERE id = ? LIMIT 1",
    args: [raceId],
  });

  if (raceLookup.rows.length === 0) {
    return NextResponse.json({ error: "Race not found." }, { status: 404 });
  }

  const row = raceLookup.rows[0];
  const phaseId = String(row.phase_id ?? "");
  const currentStatus = String(row.race_status ?? "");

  if (currentStatus === "running") {
    return NextResponse.json({
      message: "Race is already running.",
      raceId,
      raceStatus: "running",
    });
  }

  if (currentStatus === "finished" || currentStatus === "void") {
    return NextResponse.json(
      { error: `Race cannot be started from '${currentStatus}' status.` },
      { status: 409 }
    );
  }

  try {
    await turso.batch(
      [
        {
          sql: "UPDATE phases SET status = 'active' WHERE id = ?",
          args: [phaseId],
        },
        {
          sql: "UPDATE races SET race_status = 'running', locked_at = CURRENT_TIMESTAMP WHERE id = ?",
          args: [raceId],
        },
      ],
      "write"
    );

    return NextResponse.json({
      message: `Race is now running (started by ${session.email}).`,
      raceId,
      raceStatus: "running",
    });
  } catch (error) {
    const details = String(error);
    return NextResponse.json({ error: `Failed to run race: ${details}` }, { status: 500 });
  }
}
