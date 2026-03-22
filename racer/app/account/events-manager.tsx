"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type EventItem = {
  id: string;
  name: string;
  status: string;
  isPublic: boolean;
  trackLengthFt: number | null;
  createdAt: string;
  divisionCount: number;
  hasRaces: boolean;
};

type EventsResponse = {
  events?: EventItem[];
  error?: string;
};

export function EventsManager() {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPublic, setEditPublic] = useState(false);
  const [editTrackLength, setEditTrackLength] = useState("");
  const [busyEventId, setBusyEventId] = useState<string | null>(null);

  const emptyState = useMemo(() => events.length === 0 && !loading, [events.length, loading]);

  async function loadEvents() {
    setLoading(true);
    try {
      const response = await fetch("/api/events", { method: "GET" });
      const data = (await response.json()) as EventsResponse;
      if (!response.ok) {
        setMessage(data.error ?? "Failed to load events.");
        setEvents([]);
        return;
      }
      setEvents(Array.isArray(data.events) ? data.events : []);
      setMessage("");
    } catch {
      setMessage("Unable to load events.");
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadEvents();

    const onRefresh = () => {
      void loadEvents();
    };

    window.addEventListener("events:refresh", onRefresh);
    return () => window.removeEventListener("events:refresh", onRefresh);
  }, []);

  function beginEdit(event: EventItem) {
    setEditingId(event.id);
    setEditName(event.name);
    setEditPublic(event.isPublic);
    setEditTrackLength(event.trackLengthFt != null ? String(event.trackLengthFt) : "");
  }

  function cancelEdit() {
    setEditingId(null);
    setEditName("");
    setEditPublic(false);
    setEditTrackLength("");
  }

  async function saveEdit(eventId: string) {
    setBusyEventId(eventId);
    try {
      const response = await fetch(`/api/events/${eventId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName,
          isPublic: editPublic,
          trackLengthFt: editTrackLength ? parseFloat(editTrackLength) : null,
        }),
      });
      const data = (await response.json()) as { message?: string; error?: string };
      if (!response.ok) {
        setMessage(data.error ?? "Failed to update event.");
        return;
      }

      setMessage(data.message ?? "Event updated.");
      cancelEdit();
      window.dispatchEvent(new Event("events:refresh"));
      void loadEvents();
    } catch {
      setMessage("Unable to update event.");
    } finally {
      setBusyEventId(null);
    }
  }

  async function startRegistration(eventId: string) {
    setBusyEventId(eventId);
    try {
      const response = await fetch(`/api/events/${eventId}/start-registration`, {
        method: "POST",
      });
      const data = (await response.json()) as { message?: string; error?: string };
      if (!response.ok) {
        setMessage(data.error ?? "Failed to start registration.");
        return;
      }

      setMessage(data.message ?? "Registration started.");
      window.dispatchEvent(new Event("events:refresh"));
      void loadEvents();
    } catch {
      setMessage("Unable to start registration.");
    } finally {
      setBusyEventId(null);
    }
  }

  async function deleteEvent(eventId: string) {
    if (!window.confirm("Delete this event and all related data?")) {
      return;
    }

    setBusyEventId(eventId);
    try {
      const response = await fetch(`/api/events/${eventId}`, {
        method: "DELETE",
      });
      const data = (await response.json()) as { message?: string; error?: string };
      if (!response.ok) {
        setMessage(data.error ?? "Failed to delete event.");
        return;
      }

      setMessage(data.message ?? "Event deleted.");
      window.dispatchEvent(new Event("events:refresh"));
      void loadEvents();
    } catch {
      setMessage("Unable to delete event.");
    } finally {
      setBusyEventId(null);
    }
  }

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">Events</h1>
        <button
          type="button"
          onClick={() => void loadEvents()}
          className="rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700"
        >
          Refresh
        </button>
      </div>

      {message && (
        <p className="mt-3 rounded-md bg-zinc-100 px-3 py-2 text-sm dark:bg-zinc-900">{message}</p>
      )}

      <div className="mt-4 space-y-3">
        {loading ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">Loading events...</p>
        ) : null}

        {emptyState ? (
          <p className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
            No events yet. Use Create Event in the top nav.
          </p>
        ) : null}

        {events.map((event) => (
          <article
            key={event.id}
            className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900"
          >
            {editingId === event.id ? (
              <div className="space-y-3">
                <input
                  value={editName}
                  onChange={(inputEvent) => setEditName(inputEvent.target.value)}
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none ring-zinc-300 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                />
                <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                  <input
                    type="checkbox"
                    checked={editPublic}
                    onChange={(inputEvent) => setEditPublic(inputEvent.target.checked)}
                    className="h-4 w-4 rounded border-zinc-300 dark:border-zinc-700"
                  />
                  Public event
                </label>
                <div>
                  <label
                    htmlFor={`track-length-${event.id}`}
                    className="block text-sm text-zinc-700 dark:text-zinc-300"
                  >
                    Track length (feet)
                  </label>
                  <input
                    id={`track-length-${event.id}`}
                    type="number"
                    step="any"
                    min="0"
                    placeholder="e.g. 32"
                    value={editTrackLength}
                    onChange={(inputEvent) => setEditTrackLength(inputEvent.target.value)}
                    className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none ring-zinc-300 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={busyEventId === event.id}
                    onClick={() => void saveEdit(event.id)}
                    className="rounded-lg bg-zinc-900 px-3 py-2 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    disabled={busyEventId === event.id}
                    onClick={cancelEdit}
                    className="rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                      {event.name}
                    </h2>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                      Status: {event.status} | Divisions: {event.divisionCount} |{" "}
                      {event.isPublic ? "Public" : "Private"}
                      {event.trackLengthFt != null && ` | Track: ${event.trackLengthFt} ft`}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={busyEventId === event.id}
                    onClick={() => beginEdit(event)}
                    className="rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700"
                  >
                    Edit
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {["qualifying", "tournament", "paused", "completed"].includes(event.status) || event.hasRaces ? (
                    <Link
                      href={`/events/${event.id}/race`}
                      className="rounded-lg bg-zinc-900 px-3 py-2 text-sm text-white transition hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
                    >
                      View Race
                    </Link>
                  ) : event.status === "registration" ? (
                    <Link
                      href={`/events/${event.id}/register`}
                      className="rounded-lg bg-zinc-900 px-3 py-2 text-sm text-white transition hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
                    >
                      Open Registration
                    </Link>
                  ) : (
                    <button
                      type="button"
                      disabled={busyEventId === event.id}
                      onClick={() => void startRegistration(event.id)}
                      className="rounded-lg bg-zinc-900 px-3 py-2 text-sm text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
                    >
                      Start Registration
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={busyEventId === event.id}
                    onClick={() => void deleteEvent(event.id)}
                    className="rounded-lg border border-red-300 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:text-red-300"
                  >
                    Delete
                  </button>
                </div>
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
