import Link from "next/link";
import { notFound } from "next/navigation";
import { ensureDatabaseSchema, turso } from "@/lib/turso";
import { RegistrationForm } from "./registration-form";

type Division = {
  id: string;
  name: string;
};

export default async function RegisterPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;

  await ensureDatabaseSchema();

  const eventResult = await turso.execute({
    sql: "SELECT id, name, status FROM events WHERE id = ? LIMIT 1",
    args: [eventId],
  });

  if (eventResult.rows.length === 0) {
    notFound();
  }

  const event = eventResult.rows[0];
  const eventName = String(event.name ?? "");
  const eventStatus = String(event.status ?? "");

  const divisionsResult = await turso.execute({
    sql: "SELECT id, name FROM divisions WHERE event_id = ? ORDER BY sort_order ASC",
    args: [eventId],
  });

  const divisions: Division[] = divisionsResult.rows.map((row) => ({
    id: String(row.id ?? ""),
    name: String(row.name ?? ""),
  }));

  const isOpen = eventStatus === "registration";

  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-black">
      <nav className="w-full border-b border-zinc-200 bg-white px-6 py-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between">
          <Link
            href="/"
            className="font-semibold text-zinc-900 dark:text-zinc-100"
          >
            Racer
          </Link>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Registration
          </p>
        </div>
      </nav>

      <div className="mx-auto w-full max-w-2xl space-y-6 p-6">
        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
            {eventName}
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Status:{" "}
            <span className="font-medium capitalize">{eventStatus}</span>
          </p>

          {!isOpen ? (
            <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
              Registration is not currently open for this event.
            </div>
          ) : (
            <div className="mt-6">
              <RegistrationForm eventId={eventId} divisions={divisions} />
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
