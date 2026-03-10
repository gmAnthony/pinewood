"use client";

import { FormEvent, useState } from "react";

type CreateEventResponse = {
  message?: string;
  error?: string;
  eventId?: string;
};

export function CreateEventForm({ onCreated }: { onCreated?: () => void }) {
  const [eventName, setEventName] = useState("Pack Derby 2026");
  const [isPublic, setIsPublic] = useState(false);
  const [divisionInputs, setDivisionInputs] = useState(["Open Division"]);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  function updateDivisionInput(index: number, value: string) {
    setDivisionInputs((previous) => previous.map((item, idx) => (idx === index ? value : item)));
  }

  function addDivisionInput() {
    setDivisionInputs((previous) => [...previous, ""]);
  }

  function removeDivisionInput(index: number) {
    setDivisionInputs((previous) => previous.filter((_, idx) => idx !== index));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage("");

    try {
      const response = await fetch("/api/events/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventName,
          isPublic,
          divisions: divisionInputs,
        }),
      });

      const data = (await response.json()) as CreateEventResponse;

      if (!response.ok) {
        setMessage(data.error ?? "Failed to create event.");
        return;
      }

      setMessage(data.message ?? `Event created (${data.eventId}).`);
      onCreated?.();
    } catch {
      setMessage("Unable to reach server.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label htmlFor="eventName" className="mb-1 block text-sm">
          Event Name
        </label>
        <input
          id="eventName"
          value={eventName}
          onChange={(event) => setEventName(event.target.value)}
          required
          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none ring-zinc-300 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        />
      </div>

      <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
        <input
          type="checkbox"
          checked={isPublic}
          onChange={(event) => setIsPublic(event.target.checked)}
          className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-400 dark:border-zinc-700"
        />
        Make event public (show on home page)
      </label>

      <div className="space-y-2">
        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Divisions</p>
        {divisionInputs.map((division, index) => (
          <div key={`division-${index}`} className="flex gap-2">
            <input
              value={division}
              onChange={(event) => updateDivisionInput(index, event.target.value)}
              placeholder={`Division ${index + 1}`}
              required
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none ring-zinc-300 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            />
            {divisionInputs.length > 1 && (
              <button
                type="button"
                onClick={() => removeDivisionInput(index)}
                className="rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700"
              >
                Remove
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          onClick={addDivisionInput}
          className="rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700"
        >
          Add Division
        </button>
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-lg bg-zinc-900 px-4 py-2 text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-70 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
      >
        {submitting ? "Creating Event..." : "Create Event + Divisions"}
      </button>

      {message && (
        <p className="rounded-md bg-zinc-100 px-3 py-2 text-sm dark:bg-zinc-900">{message}</p>
      )}
    </form>
  );
}
