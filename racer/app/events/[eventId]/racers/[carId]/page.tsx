import Link from "next/link";
import { notFound } from "next/navigation";
import { ensureDatabaseSchema, turso } from "@/lib/turso";

const TRACK_LENGTH_FT = 44;

function formatTime(ms: number): string {
  return (ms / 1000).toFixed(2);
}

function toMph(timeMs: number): number {
  const miles = TRACK_LENGTH_FT / 5280;
  const hours = timeMs / 3_600_000;
  return miles / hours;
}

function formatMph(mph: number): string {
  return mph.toFixed(1);
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    registered: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
    checked_in: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900 dark:text-cyan-300",
    approved: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300",
    changes_requested: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
    scratched: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
    pending: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
    pass: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300",
    fail: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
    "n/a": "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400",
    paid: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300",
    pay_later: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
  };
  const label = status.replace(/_/g, " ");
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${colors[status] ?? colors.pending}`}>
      {label}
    </span>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-zinc-900 dark:text-zinc-100">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{sub}</p>}
    </div>
  );
}

type Opponent = {
  carId: string;
  carNumber: number;
  displayName: string;
  laneNumber: number;
  timeMs: number | null;
  resultCode: string;
  place: number | null;
};

type Heat = {
  raceId: string;
  raceNumber: number;
  roundNumber: number | null;
  groupNumber: number | null;
  phaseType: string;
  laneNumber: number;
  timeMs: number | null;
  resultCode: string;
  place: number | null;
  opponents: Opponent[];
};

type LeaderboardRow = {
  carId: string;
  carNumber: number;
  displayName: string;
  carName: string;
  divisionName: string;
  avgTimeMs: number;
  rank: number;
};

export default async function RacerDetailPage({
  params,
}: {
  params: Promise<{ eventId: string; carId: string }>;
}) {
  const { eventId, carId } = await params;

  await ensureDatabaseSchema();

  const eventResult = await turso.execute({
    sql: "SELECT id, name FROM events WHERE id = ? LIMIT 1",
    args: [eventId],
  });
  if (eventResult.rows.length === 0) notFound();
  const eventName = String(eventResult.rows[0].name ?? "");

  const carResult = await turso.execute({
    sql: `SELECT
            c.car_number, c.car_name, c.registration_status,
            c.payment_amount, c.payment_status, c.checked_in_at,
            c.scratched_at, c.scratch_reason,
            r.display_name, r.first_name, r.last_name, r.age,
            d.id AS division_id, d.name AS division_name
          FROM cars c
          JOIN racers r ON r.id = c.racer_id
          JOIN divisions d ON d.id = c.division_id
          WHERE c.id = ? AND c.event_id = ?
          LIMIT 1`,
    args: [carId, eventId],
  });
  if (carResult.rows.length === 0) notFound();

  const cr = carResult.rows[0];
  const displayName = String(cr.display_name ?? "");
  const carName = String(cr.car_name ?? "");
  const carNumber = Number(cr.car_number ?? 0);
  const divisionName = String(cr.division_name ?? "");
  const divisionId = String(cr.division_id ?? "");
  const registrationStatus = String(cr.registration_status ?? "");
  const paymentAmount = Number(cr.payment_amount ?? 0);
  const paymentStatus = String(cr.payment_status ?? "pay_later");
  const age = cr.age != null ? Number(cr.age) : null;

  const inspResult = await turso.execute({
    sql: "SELECT * FROM inspections WHERE car_id = ? LIMIT 1",
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
      }
    : null;

  const racesResult = await turso.execute({
    sql: `SELECT
            r.id AS race_id,
            r.race_number, r.round_number, r.group_number,
            p.phase_type,
            rl.lane_number,
            ralr.time_ms, ralr.result_code, ralr.place_in_attempt
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

  const raceIds = racesResult.rows.map((r) => String(r.race_id));

  const opponentMap = new Map<string, Opponent[]>();
  if (raceIds.length > 0) {
    const placeholders = raceIds.map(() => "?").join(",");
    const oppResult = await turso.execute({
      sql: `SELECT
              ra.race_id,
              ralr.car_id,
              c.car_number,
              rac.display_name,
              ralr.lane_number,
              ralr.time_ms,
              ralr.result_code,
              ralr.place_in_attempt
            FROM race_attempt_lane_results ralr
            JOIN race_attempts ra ON ra.id = ralr.attempt_id
            JOIN cars c ON c.id = ralr.car_id
            JOIN racers rac ON rac.id = c.racer_id
            WHERE ra.race_id IN (${placeholders})
              AND ra.attempt_status = 'official'
              AND ralr.car_id != ?
            ORDER BY ralr.place_in_attempt ASC`,
      args: [...raceIds, carId],
    });
    for (const r of oppResult.rows) {
      const rid = String(r.race_id);
      if (!opponentMap.has(rid)) opponentMap.set(rid, []);
      opponentMap.get(rid)!.push({
        carId: String(r.car_id),
        carNumber: Number(r.car_number ?? 0),
        displayName: String(r.display_name ?? ""),
        laneNumber: Number(r.lane_number),
        timeMs: r.time_ms != null ? Number(r.time_ms) : null,
        resultCode: String(r.result_code ?? ""),
        place: r.place_in_attempt != null ? Number(r.place_in_attempt) : null,
      });
    }
  }

  const heats: Heat[] = racesResult.rows.map((r) => {
    const rid = String(r.race_id);
    return {
      raceId: rid,
      raceNumber: Number(r.race_number),
      roundNumber: r.round_number != null ? Number(r.round_number) : null,
      groupNumber: r.group_number != null ? Number(r.group_number) : null,
      phaseType: String(r.phase_type ?? "qualifying"),
      laneNumber: Number(r.lane_number),
      timeMs: r.time_ms != null ? Number(r.time_ms) : null,
      resultCode: String(r.result_code ?? ""),
      place: r.place_in_attempt != null ? Number(r.place_in_attempt) : null,
      opponents: opponentMap.get(rid) ?? [],
    };
  });

  const finishedTimes = heats
    .filter((h) => h.resultCode === "finished" && h.timeMs != null)
    .map((h) => h.timeMs!);

  const avgTimeMs =
    finishedTimes.length > 0
      ? Math.round(finishedTimes.reduce((a, b) => a + b, 0) / finishedTimes.length)
      : null;
  const bestTimeMs = finishedTimes.length > 0 ? Math.min(...finishedTimes) : null;
  const worstTimeMs = finishedTimes.length > 0 ? Math.max(...finishedTimes) : null;
  const topSpeedMph = bestTimeMs != null ? toMph(bestTimeMs) : null;
  const avgSpeedMph = avgTimeMs != null ? toMph(avgTimeMs) : null;

  let fasterThanPct: number | null = null;
  if (avgTimeMs != null) {
    const divResult = await turso.execute({
      sql: `SELECT ralr.car_id, AVG(ralr.time_ms) AS avg_time
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
      args: [eventId, divisionId],
    });
    const allAvgs = divResult.rows.map((r) => Number(r.avg_time));
    if (allAvgs.length > 1) {
      const slower = allAvgs.filter((t) => t > avgTimeMs).length;
      fasterThanPct = Math.round((slower / (allAvgs.length - 1)) * 100);
    }
  }

  // Division leaderboard
  const divLeaderboardResult = await turso.execute({
    sql: `SELECT
            ralr.car_id,
            c.car_number,
            c.car_name,
            rac.display_name,
            d.name AS division_name,
            AVG(ralr.time_ms) AS avg_time
          FROM race_attempt_lane_results ralr
          JOIN race_attempts ra ON ra.id = ralr.attempt_id
          JOIN races r ON r.id = ra.race_id
          JOIN phases p ON p.id = r.phase_id
          JOIN cars c ON c.id = ralr.car_id
          JOIN racers rac ON rac.id = c.racer_id
          JOIN divisions d ON d.id = c.division_id
          WHERE p.event_id = ?
            AND p.phase_type = 'qualifying'
            AND ra.attempt_status = 'official'
            AND ralr.result_code = 'finished'
            AND ralr.time_ms IS NOT NULL
            AND c.division_id = ?
          GROUP BY ralr.car_id
          ORDER BY avg_time ASC`,
    args: [eventId, divisionId],
  });

  const divisionLeaderboard: LeaderboardRow[] = divLeaderboardResult.rows.map((r, i) => ({
    carId: String(r.car_id),
    carNumber: Number(r.car_number ?? 0),
    displayName: String(r.display_name ?? ""),
    carName: String(r.car_name ?? ""),
    divisionName: String(r.division_name ?? ""),
    avgTimeMs: Math.round(Number(r.avg_time)),
    rank: i + 1,
  }));

  // Overall leaderboard (all divisions)
  const overallLeaderboardResult = await turso.execute({
    sql: `SELECT
            ralr.car_id,
            c.car_number,
            c.car_name,
            rac.display_name,
            d.name AS division_name,
            AVG(ralr.time_ms) AS avg_time
          FROM race_attempt_lane_results ralr
          JOIN race_attempts ra ON ra.id = ralr.attempt_id
          JOIN races r ON r.id = ra.race_id
          JOIN phases p ON p.id = r.phase_id
          JOIN cars c ON c.id = ralr.car_id
          JOIN racers rac ON rac.id = c.racer_id
          JOIN divisions d ON d.id = c.division_id
          WHERE p.event_id = ?
            AND p.phase_type = 'qualifying'
            AND ra.attempt_status = 'official'
            AND ralr.result_code = 'finished'
            AND ralr.time_ms IS NOT NULL
          GROUP BY ralr.car_id
          ORDER BY avg_time ASC`,
    args: [eventId],
  });

  const overallLeaderboard: LeaderboardRow[] = overallLeaderboardResult.rows.map((r, i) => ({
    carId: String(r.car_id),
    carNumber: Number(r.car_number ?? 0),
    displayName: String(r.display_name ?? ""),
    carName: String(r.car_name ?? ""),
    divisionName: String(r.division_name ?? ""),
    avgTimeMs: Math.round(Number(r.avg_time)),
    rank: i + 1,
  }));

  // "Faster than X of all cars" (overall, all divisions)
  let fasterThanAllPct: number | null = null;
  if (avgTimeMs != null && overallLeaderboard.length > 1) {
    const slower = overallLeaderboard.filter((e) => e.avgTimeMs > avgTimeMs).length;
    fasterThanAllPct = Math.round((slower / (overallLeaderboard.length - 1)) * 100);
  }

  // Rank best time against every individual race time in the event
  let bestTimeRankLabel: string | null = null;
  if (bestTimeMs != null) {
    const allTimesResult = await turso.execute({
      sql: `SELECT ralr.time_ms
            FROM race_attempt_lane_results ralr
            JOIN race_attempts ra ON ra.id = ralr.attempt_id
            JOIN races r ON r.id = ra.race_id
            JOIN phases p ON p.id = r.phase_id
            WHERE p.event_id = ?
              AND ra.attempt_status = 'official'
              AND ralr.result_code = 'finished'
              AND ralr.time_ms IS NOT NULL
            ORDER BY ralr.time_ms ASC`,
      args: [eventId],
    });
    const allTimes = allTimesResult.rows.map((r) => Number(r.time_ms));
    const rank = allTimes.findIndex((t) => t >= bestTimeMs) + 1;
    bestTimeRankLabel = `#${rank} of ${allTimes.length} runs`;
  }

  function placeLabel(p: number) {
    if (p === 1) return "1st";
    if (p === 2) return "2nd";
    if (p === 3) return "3rd";
    return `${p}th`;
  }

  const inspectionChecks = inspection
    ? [
        { label: "Body Material", value: inspection.bodyMaterialStatus },
        { label: "Wheels", value: inspection.wheelsStatus },
        { label: "Axles", value: inspection.axlesStatus },
        { label: "Lubricants", value: inspection.lubricantsStatus },
      ].filter((c) => c.value != null)
    : [];

  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-black">
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mx-auto flex w-full max-w-4xl items-center gap-4 px-4 py-3">
          <Link
            href={`/events/${eventId}`}
            className="shrink-0 text-sm text-zinc-500 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            &larr; Back to {eventName}
          </Link>
        </div>
      </header>

      <div className="mx-auto w-full max-w-4xl px-4 py-6">
        {/* Header */}
        <div className="mb-6 flex flex-wrap items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-zinc-200 text-xl font-bold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
            #{carNumber}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{displayName}</h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              {carName}
              {age != null && <span> &middot; Age {age}</span>}
            </p>
            <div className="mt-1.5 flex flex-wrap gap-2">
              <span className="rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-medium text-purple-700 dark:bg-purple-900 dark:text-purple-300">
                {divisionName}
              </span>
              <StatusBadge status={registrationStatus} />
              <StatusBadge status={paymentStatus} />
            </div>
          </div>
        </div>

        {/* Stats */}
        {finishedTimes.length > 0 && (
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard
              label="Avg time"
              value={avgTimeMs != null ? `${formatTime(avgTimeMs)}s` : "—"}
              sub={avgSpeedMph != null ? `${formatMph(avgSpeedMph)} mph` : undefined}
            />
            <StatCard
              label="Best time"
              value={bestTimeMs != null ? `${formatTime(bestTimeMs)}s` : "—"}
              sub={
                [
                  topSpeedMph != null ? `${formatMph(topSpeedMph)} mph` : null,
                  bestTimeRankLabel,
                ]
                  .filter(Boolean)
                  .join(" · ") || undefined
              }
            />
            <StatCard
              label="Faster than"
              value={fasterThanPct != null ? `${fasterThanPct}%` : "—"}
              sub={fasterThanPct != null ? "of division" : "not enough data"}
            />
            <StatCard
              label="Faster than"
              value={fasterThanAllPct != null ? `${fasterThanAllPct}%` : "—"}
              sub={fasterThanAllPct != null ? "of all cars" : "not enough data"}
            />
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Registration & Inspection */}
          <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
            <div className="border-b border-zinc-200 px-4 py-2.5 dark:border-zinc-800">
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Registration &amp; Inspection</h2>
            </div>
            <div className="space-y-3 px-4 py-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-zinc-500 dark:text-zinc-400">Registration</span>
                <StatusBadge status={registrationStatus} />
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-zinc-500 dark:text-zinc-400">Payment</span>
                <span className="text-zinc-900 dark:text-zinc-100">
                  ${paymentAmount} <StatusBadge status={paymentStatus} />
                </span>
              </div>
              {inspection ? (
                <>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-zinc-500 dark:text-zinc-400">Inspection</span>
                    <StatusBadge status={inspection.overallStatus} />
                  </div>
                  {inspection.weightOz != null && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-zinc-500 dark:text-zinc-400">Weight</span>
                      <span className="font-mono text-zinc-900 dark:text-zinc-100">{inspection.weightOz} oz</span>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    {inspection.lengthIn != null && (
                      <span className="text-xs text-zinc-500 dark:text-zinc-400">L: {inspection.lengthIn}&quot;</span>
                    )}
                    {inspection.widthIn != null && (
                      <span className="text-xs text-zinc-500 dark:text-zinc-400">W: {inspection.widthIn}&quot;</span>
                    )}
                    {inspection.heightIn != null && (
                      <span className="text-xs text-zinc-500 dark:text-zinc-400">H: {inspection.heightIn}&quot;</span>
                    )}
                    {inspection.groundClearanceIn != null && (
                      <span className="text-xs text-zinc-500 dark:text-zinc-400">GC: {inspection.groundClearanceIn}&quot;</span>
                    )}
                  </div>
                  {inspectionChecks.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {inspectionChecks.map((c) => (
                        <div key={c.label} className="flex items-center gap-1.5 text-xs">
                          <span className="text-zinc-500 dark:text-zinc-400">{c.label}:</span>
                          <StatusBadge status={c.value!} />
                        </div>
                      ))}
                    </div>
                  )}
                  {inspection.inspectorName && (
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      Inspector: {inspection.inspectorName}
                    </p>
                  )}
                  {inspection.inspectorNotes && (
                    <p className="text-xs italic text-zinc-500 dark:text-zinc-400">
                      {inspection.inspectorNotes}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-xs text-zinc-500 dark:text-zinc-400">No inspection record yet.</p>
              )}
            </div>
          </div>

          {/* Race History */}
          <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
            <div className="border-b border-zinc-200 px-4 py-2.5 dark:border-zinc-800">
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Race History</h2>
            </div>
            {heats.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
                No races yet.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-100 text-left text-xs font-medium text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                      <th className="px-4 py-2">Race</th>
                      <th className="px-4 py-2">Lane</th>
                      <th className="px-4 py-2 text-right">Time</th>
                      <th className="px-4 py-2 text-right">Speed</th>
                      <th className="px-4 py-2 text-right">Place</th>
                    </tr>
                  </thead>
                  <tbody>
                    {heats.map((h, i) => {
                      const isDnf = h.resultCode === "dnf";
                      const label =
                        h.phaseType === "tournament"
                          ? `R${h.roundNumber ?? 1} M${h.groupNumber ?? "—"}`
                          : `Heat ${h.raceNumber}`;
                      return (
                        <tr
                          key={i}
                          className="border-b border-zinc-100 last:border-0 dark:border-zinc-800"
                        >
                          <td className="px-4 py-2 align-top">
                            <div className="font-medium text-zinc-900 dark:text-zinc-100">
                              {label}
                              {h.phaseType === "tournament" && (
                                <span className="ml-1.5 rounded bg-purple-100 px-1.5 py-0.5 text-[10px] font-medium text-purple-700 dark:bg-purple-900 dark:text-purple-300">
                                  bracket
                                </span>
                              )}
                            </div>
                            {h.opponents.length > 0 && (
                              <div className="mt-1 space-y-0.5">
                                {h.opponents.map((opp) => (
                                  <div key={opp.carId} className="text-[11px] text-zinc-400 dark:text-zinc-500">
                                    <Link
                                      href={`/events/${eventId}/racers/${opp.carId}`}
                                      className="hover:text-blue-500 hover:underline"
                                    >
                                      vs #{opp.carNumber} {opp.displayName}
                                    </Link>
                                    {" "}
                                    <span className="font-mono tabular-nums">
                                      {opp.resultCode === "dnf"
                                        ? "DNF"
                                        : opp.timeMs != null
                                          ? `${formatTime(opp.timeMs)}s`
                                          : "—"}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-2 align-top text-zinc-600 dark:text-zinc-400">L{h.laneNumber}</td>
                          <td className="px-4 py-2 align-top text-right font-mono tabular-nums text-zinc-900 dark:text-zinc-100">
                            {isDnf ? "DNF" : h.timeMs != null ? `${formatTime(h.timeMs)}s` : "—"}
                          </td>
                          <td className="px-4 py-2 align-top text-right font-mono tabular-nums text-zinc-500 dark:text-zinc-400">
                            {!isDnf && h.timeMs != null
                              ? `${formatMph(toMph(h.timeMs))} mph`
                              : "—"}
                          </td>
                          <td className="px-4 py-2 align-top text-right">
                            {h.place != null ? (
                              <span
                                className={`font-medium ${
                                  h.place === 1
                                    ? "text-emerald-600 dark:text-emerald-400"
                                    : "text-zinc-600 dark:text-zinc-400"
                                }`}
                              >
                                {placeLabel(h.place)}
                              </span>
                            ) : (
                              <span className="text-zinc-400">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Leaderboards */}
        {(divisionLeaderboard.length > 0 || overallLeaderboard.length > 0) && (
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            {/* Division Leaderboard */}
            {divisionLeaderboard.length > 0 && (
              <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
                <div className="border-b border-zinc-200 px-4 py-2.5 dark:border-zinc-800">
                  <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    {divisionName} Leaderboard
                  </h2>
                </div>
                <div className="max-h-80 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="sticky top-0 border-b border-zinc-100 bg-white text-left text-xs font-medium text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
                        <th className="px-4 py-2 w-10">#</th>
                        <th className="px-4 py-2">Racer</th>
                        <th className="px-4 py-2 text-right">Avg Time</th>
                        <th className="px-4 py-2 text-right">Speed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {divisionLeaderboard.map((entry) => {
                        const isMe = entry.carId === carId;
                        return (
                          <tr
                            key={entry.carId}
                            className={`border-b border-zinc-50 last:border-0 dark:border-zinc-900 ${
                              isMe ? "bg-blue-50 dark:bg-blue-950/30" : ""
                            }`}
                          >
                            <td className={`px-4 py-1.5 font-mono text-xs ${isMe ? "font-bold text-blue-600 dark:text-blue-400" : "text-zinc-500 dark:text-zinc-400"}`}>
                              {entry.rank}
                            </td>
                            <td className="px-4 py-1.5">
                              <Link
                                href={`/events/${eventId}/racers/${entry.carId}`}
                                className={`hover:underline ${isMe ? "font-semibold text-blue-700 dark:text-blue-300" : "text-zinc-900 dark:text-zinc-100"}`}
                              >
                                #{entry.carNumber} {entry.displayName}
                              </Link>
                              {isMe && (
                                <span className="ml-1.5 rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                                  you
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-1.5 text-right font-mono tabular-nums text-zinc-900 dark:text-zinc-100">
                              {formatTime(entry.avgTimeMs)}s
                            </td>
                            <td className="px-4 py-1.5 text-right font-mono tabular-nums text-zinc-500 dark:text-zinc-400">
                              {formatMph(toMph(entry.avgTimeMs))} mph
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Overall Leaderboard */}
            {overallLeaderboard.length > 0 && (
              <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
                <div className="border-b border-zinc-200 px-4 py-2.5 dark:border-zinc-800">
                  <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    Overall Leaderboard
                  </h2>
                </div>
                <div className="max-h-80 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="sticky top-0 border-b border-zinc-100 bg-white text-left text-xs font-medium text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
                        <th className="px-4 py-2 w-10">#</th>
                        <th className="px-4 py-2">Racer</th>
                        <th className="px-4 py-2">Division</th>
                        <th className="px-4 py-2 text-right">Avg Time</th>
                        <th className="px-4 py-2 text-right">Speed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {overallLeaderboard.map((entry) => {
                        const isMe = entry.carId === carId;
                        return (
                          <tr
                            key={entry.carId}
                            className={`border-b border-zinc-50 last:border-0 dark:border-zinc-900 ${
                              isMe ? "bg-blue-50 dark:bg-blue-950/30" : ""
                            }`}
                          >
                            <td className={`px-4 py-1.5 font-mono text-xs ${isMe ? "font-bold text-blue-600 dark:text-blue-400" : "text-zinc-500 dark:text-zinc-400"}`}>
                              {entry.rank}
                            </td>
                            <td className="px-4 py-1.5">
                              <Link
                                href={`/events/${eventId}/racers/${entry.carId}`}
                                className={`hover:underline ${isMe ? "font-semibold text-blue-700 dark:text-blue-300" : "text-zinc-900 dark:text-zinc-100"}`}
                              >
                                #{entry.carNumber} {entry.displayName}
                              </Link>
                              {isMe && (
                                <span className="ml-1.5 rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                                  you
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                              {entry.divisionName}
                            </td>
                            <td className="px-4 py-1.5 text-right font-mono tabular-nums text-zinc-900 dark:text-zinc-100">
                              {formatTime(entry.avgTimeMs)}s
                            </td>
                            <td className="px-4 py-1.5 text-right font-mono tabular-nums text-zinc-500 dark:text-zinc-400">
                              {formatMph(toMph(entry.avgTimeMs))} mph
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Track info */}
        <p className="mt-6 text-center text-[11px] text-zinc-400 dark:text-zinc-500">
          Speed calculations based on {TRACK_LENGTH_FT} ft track
        </p>
      </div>
    </main>
  );
}
