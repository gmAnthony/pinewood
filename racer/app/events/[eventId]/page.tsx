import Link from "next/link";
import { notFound } from "next/navigation";
import { ensureDatabaseSchema, turso } from "@/lib/turso";
import { EventDisplay } from "./event-display";

export default async function EventSpectatorPage({
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

  const row = eventResult.rows[0];
  const eventName = String(row.name ?? "");
  const eventStatus = String(row.status ?? "");
  const laneCount = Number(row.lane_count ?? 2);

  const divisionsResult = await turso.execute({
    sql: `SELECT id, name, sort_order
          FROM divisions
          WHERE event_id = ?
          ORDER BY sort_order ASC, name ASC`,
    args: [eventId],
  });

  const divisions = divisionsResult.rows.map((r) => ({
    id: String(r.id ?? ""),
    name: String(r.name ?? ""),
    sortOrder: Number(r.sort_order ?? 0),
  }));

  return (
    <main className="flex h-[calc(100dvh-4rem)] flex-col overflow-hidden bg-zinc-50 dark:bg-black">
      <header className="shrink-0 border-b border-zinc-200 bg-white px-4 py-2 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mx-auto flex w-full max-w-[1920px] items-center justify-between gap-4">
          <Link
            href="/"
            className="shrink-0 text-sm font-semibold text-zinc-900 hover:text-zinc-600 dark:text-zinc-100 dark:hover:text-zinc-300"
          >
            Racer
          </Link>
          <p className="truncate text-center text-xs text-zinc-500 dark:text-zinc-400">
            Spectator display
          </p>
        </div>
      </header>

      <EventDisplay
        eventId={eventId}
        eventName={eventName}
        eventStatus={eventStatus}
        laneCount={laneCount}
        divisions={divisions}
      />
    </main>
  );
}
