import Link from "next/link";
import { notFound } from "next/navigation";
import { ensureDatabaseSchema, turso } from "@/lib/turso";
import { RaceDay } from "./race-day";

export default async function RacePage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;

  await ensureDatabaseSchema();

  const eventResult = await turso.execute({
    sql: "SELECT id, name, status, lane_count FROM events WHERE id = ? LIMIT 1",
    args: [eventId],
  });

  if (eventResult.rows.length === 0) {
    notFound();
  }

  const event = eventResult.rows[0];
  const eventName = String(event.name ?? "");
  const eventStatus = String(event.status ?? "");
  const laneCount = Number(event.lane_count ?? 2);

  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-black">
      <nav className="w-full border-b border-zinc-200 bg-white px-6 py-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between">
          <Link href="/" className="font-semibold text-zinc-900 dark:text-zinc-100">
            Racer
          </Link>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">Race Day</p>
        </div>
      </nav>

      <div className="mx-auto w-full max-w-3xl space-y-6 p-6">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
            {eventName}
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Status: <span className="font-medium capitalize">{eventStatus}</span>
            {" · "}
            {laneCount} lanes
          </p>
        </div>

        <RaceDay eventId={eventId} laneCount={laneCount} />
      </div>
    </main>
  );
}
