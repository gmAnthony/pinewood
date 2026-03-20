import Link from "next/link";
import { ensureDatabaseSchema, turso } from "@/lib/turso";

type PublicEvent = {
  id: string;
  name: string;
};

export default async function Home() {
  await ensureDatabaseSchema();
  const result = await turso.execute(
    `SELECT id, name
     FROM events
     WHERE is_public = 1
     ORDER BY created_at DESC
     LIMIT 50`
  );

  const publicEvents: PublicEvent[] = result.rows.map((row) => ({
    id: String(row.id ?? ""),
    name: String(row.name ?? ""),
  }));

  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-black">
      <nav className="w-full border-b border-zinc-200 bg-white px-6 py-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between">
          <p className="font-semibold text-zinc-900 dark:text-zinc-100">Racer</p>
            <Link
              href="/auth"
              className="rounded-lg bg-zinc-900 px-3 py-2 text-sm text-white transition hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
            >
              Login / Create Account
            </Link>
        </div>
      </nav>

      <div className="mx-auto w-full max-w-2xl space-y-6 p-6">
        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Public Events</h2>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Events marked public appear here.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {publicEvents.length === 0 ? (
              <p className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
                No public events yet.
              </p>
            ) : (
              publicEvents.map((event) => (
                <Link
                  key={event.id}
                  href={`/events/${event.id}`}
                  className="block rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 transition hover:border-zinc-300 hover:bg-white dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-600 dark:hover:bg-zinc-800"
                >
                  <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    {event.name}
                  </p>
                </Link>
              ))
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
