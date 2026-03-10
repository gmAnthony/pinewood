import { NextResponse } from "next/server";
import { ensureDatabaseSchema, turso } from "@/lib/turso";

type Params = { params: Promise<{ eventId: string; carId: string }> };

const PASS_FAIL_VALUES = new Set(["pass", "fail", "n/a"]);

type PatchBody = {
  registrationStatus?: string;
  scratchReason?: string;

  weightOz?: number | null;
  lengthIn?: number | null;
  widthIn?: number | null;
  heightIn?: number | null;
  groundClearanceIn?: number | null;
  bodyMaterialStatus?: string | null;
  wheelsStatus?: string | null;
  axlesStatus?: string | null;
  lubricantsStatus?: string | null;
  inspectorName?: string | null;
  inspectorNotes?: string | null;
  overallStatus?: string | null;
};

function optNum(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function optPassFail(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  return PASS_FAIL_VALUES.has(String(v)) ? String(v) : null;
}

export async function GET(_request: Request, context: Params) {
  const { eventId, carId } = await context.params;

  await ensureDatabaseSchema();

  const result = await turso.execute({
    sql: `SELECT
            i.*,
            c.car_number,
            c.car_name,
            c.registration_status,
            r.display_name
          FROM cars c
          JOIN racers r ON r.id = c.racer_id
          LEFT JOIN inspections i ON i.car_id = c.id
          WHERE c.id = ? AND c.event_id = ?
          LIMIT 1`,
    args: [carId, eventId],
  });

  if (result.rows.length === 0) {
    return NextResponse.json({ error: "Car not found." }, { status: 404 });
  }

  const row = result.rows[0];

  return NextResponse.json({
    car: {
      carId,
      carNumber: Number(row.car_number ?? 0),
      carName: String(row.car_name ?? ""),
      displayName: String(row.display_name ?? ""),
      registrationStatus: String(row.registration_status ?? ""),
    },
    inspection: row.id
      ? {
          id: String(row.id),
          overallStatus: String(row.overall_status ?? "pending"),
          weightOz: row.weight_oz != null ? Number(row.weight_oz) : null,
          lengthIn: row.length_in != null ? Number(row.length_in) : null,
          widthIn: row.width_in != null ? Number(row.width_in) : null,
          heightIn: row.height_in != null ? Number(row.height_in) : null,
          groundClearanceIn: row.ground_clearance_in != null ? Number(row.ground_clearance_in) : null,
          bodyMaterialStatus: row.body_material_status != null ? String(row.body_material_status) : null,
          wheelsStatus: row.wheels_status != null ? String(row.wheels_status) : null,
          axlesStatus: row.axles_status != null ? String(row.axles_status) : null,
          lubricantsStatus: row.lubricants_status != null ? String(row.lubricants_status) : null,
          inspectorName: row.inspector_name != null ? String(row.inspector_name) : null,
          inspectorNotes: row.inspector_notes != null ? String(row.inspector_notes) : null,
        }
      : null,
  });
}

export async function PATCH(request: Request, context: Params) {
  const { eventId, carId } = await context.params;

  await ensureDatabaseSchema();

  const car = await turso.execute({
    sql: "SELECT id, racer_id, registration_status FROM cars WHERE id = ? AND event_id = ? LIMIT 1",
    args: [carId, eventId],
  });

  if (car.rows.length === 0) {
    return NextResponse.json({ error: "Car not found." }, { status: 404 });
  }

  const body = (await request.json()) as PatchBody;

  if (body.registrationStatus === "scratched") {
    const reason = (body.scratchReason ?? "").trim() || null;
    await turso.execute({
      sql: `UPDATE cars
            SET registration_status = 'scratched',
                scratched_at = CURRENT_TIMESTAMP,
                scratch_reason = ?
            WHERE id = ?`,
      args: [reason, carId],
    });
    await turso.execute({
      sql: "UPDATE inspections SET overall_status = 'scratched' WHERE car_id = ?",
      args: [carId],
    });
    return NextResponse.json({ message: "Racer scratched." });
  }

  if (body.registrationStatus === "registered") {
    const currentStatus = String(car.rows[0].registration_status ?? "");
    if (currentStatus !== "scratched") {
      return NextResponse.json({ error: "Can only unscratch a scratched racer." }, { status: 409 });
    }
    await turso.execute({
      sql: `UPDATE cars
            SET registration_status = 'registered',
                scratched_at = NULL,
                scratch_reason = NULL
            WHERE id = ?`,
      args: [carId],
    });
    await turso.execute({
      sql: "UPDATE inspections SET overall_status = 'pending' WHERE car_id = ?",
      args: [carId],
    });
    return NextResponse.json({ message: "Racer restored." });
  }

  const inspection = await turso.execute({
    sql: "SELECT id FROM inspections WHERE car_id = ? LIMIT 1",
    args: [carId],
  });

  if (inspection.rows.length === 0) {
    return NextResponse.json({ error: "Inspection record not found." }, { status: 404 });
  }

  const sets: string[] = [];
  const args: (string | number | null)[] = [];

  function addNum(col: string, val: unknown) {
    if (val === undefined) return;
    sets.push(`${col} = ?`);
    args.push(optNum(val));
  }

  function addPf(col: string, val: unknown) {
    if (val === undefined) return;
    sets.push(`${col} = ?`);
    args.push(optPassFail(val));
  }

  function addText(col: string, val: string | null | undefined) {
    if (val === undefined) return;
    sets.push(`${col} = ?`);
    args.push(val === null ? null : String(val).trim() || null);
  }

  addNum("weight_oz", body.weightOz);
  addNum("length_in", body.lengthIn);
  addNum("width_in", body.widthIn);
  addNum("height_in", body.heightIn);
  addNum("ground_clearance_in", body.groundClearanceIn);
  addPf("body_material_status", body.bodyMaterialStatus);
  addPf("wheels_status", body.wheelsStatus);
  addPf("axles_status", body.axlesStatus);
  addPf("lubricants_status", body.lubricantsStatus);
  addText("inspector_name", body.inspectorName);
  addText("inspector_notes", body.inspectorNotes);

  if (body.overallStatus !== undefined) {
    const allowed = new Set(["pending", "approved", "changes_requested", "scratched"]);
    if (body.overallStatus && allowed.has(body.overallStatus)) {
      if (body.overallStatus === "approved") {
        const violations: string[] = [];
        const w = optNum(body.weightOz);
        const l = optNum(body.lengthIn);
        const wd = optNum(body.widthIn);
        const h = optNum(body.heightIn);
        const gc = optNum(body.groundClearanceIn);

        if (w != null && w > 5) violations.push(`Weight ${w} oz exceeds 5 oz max`);
        if (l != null && l > 7) violations.push(`Length ${l} in exceeds 7 in max`);
        if (wd != null && wd > 2.75) violations.push(`Width ${wd} in exceeds 2.75 in max`);
        if (h != null && h > 6) violations.push(`Height ${h} in exceeds 6 in max`);
        if (gc != null && gc < 0.375) violations.push(`Ground clearance ${gc} in below 3/8 in min`);

        if (violations.length > 0) {
          return NextResponse.json(
            { error: `Cannot approve: ${violations.join("; ")}.` },
            { status: 422 }
          );
        }
      }

      sets.push("overall_status = ?");
      args.push(body.overallStatus);
      if (body.overallStatus === "approved") {
        sets.push("approved_at = CURRENT_TIMESTAMP");
      }
    }
  }

  if (sets.length === 0) {
    return NextResponse.json({ error: "No fields to update." }, { status: 400 });
  }

  sets.push("inspected_at = CURRENT_TIMESTAMP");
  sets.push("updated_at = CURRENT_TIMESTAMP");
  args.push(carId);

  try {
    await turso.execute({
      sql: `UPDATE inspections SET ${sets.join(", ")} WHERE car_id = ?`,
      args,
    });

    if (body.overallStatus === "approved") {
      await turso.execute({
        sql: "UPDATE cars SET registration_status = 'approved' WHERE id = ?",
        args: [carId],
      });
    } else if (body.overallStatus === "changes_requested") {
      await turso.execute({
        sql: "UPDATE cars SET registration_status = 'changes_requested' WHERE id = ?",
        args: [carId],
      });
    }

    return NextResponse.json({ message: "Inspection updated." });
  } catch (error) {
    return NextResponse.json(
      { error: `Failed to update: ${String(error)}` },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: Request, context: Params) {
  const { eventId, carId } = await context.params;

  await ensureDatabaseSchema();

  const car = await turso.execute({
    sql: "SELECT id, racer_id, registration_status FROM cars WHERE id = ? AND event_id = ? LIMIT 1",
    args: [carId, eventId],
  });

  if (car.rows.length === 0) {
    return NextResponse.json({ error: "Car not found." }, { status: 404 });
  }

  if (String(car.rows[0].registration_status) !== "scratched") {
    return NextResponse.json(
      { error: "Only scratched racers can be deleted." },
      { status: 409 }
    );
  }

  const racerId = String(car.rows[0].racer_id ?? "");

  try {
    await turso.execute({ sql: "DELETE FROM inspections WHERE car_id = ?", args: [carId] });
    await turso.execute({ sql: "DELETE FROM cars WHERE id = ?", args: [carId] });

    const otherCars = await turso.execute({
      sql: "SELECT id FROM cars WHERE racer_id = ? LIMIT 1",
      args: [racerId],
    });
    if (otherCars.rows.length === 0) {
      await turso.execute({ sql: "DELETE FROM racers WHERE id = ?", args: [racerId] });
    }

    return NextResponse.json({ message: "Racer and car deleted." });
  } catch (error) {
    return NextResponse.json(
      { error: `Failed to delete: ${String(error)}` },
      { status: 500 }
    );
  }
}
