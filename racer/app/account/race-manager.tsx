"use client";

import { FormEvent, useState } from "react";

type RaceType = "heat" | "tournament";

type CreatedDivision = {
  id: string;
  name: string;
  sortOrder: number;
};

type CreateEventResponse = {
  message?: string;
  error?: string;
  eventId?: string;
  eventName?: string;
  divisions?: CreatedDivision[];
};

type GenerateRacesResponse = {
  message?: string;
  error?: string;
  phaseId?: string;
  raceIds?: string[];
  racesCreated?: number;
  carsIncluded?: number;
  laneCount?: number;
  divisionId?: string;
};

export function RaceManager() {
  const [eventName, setEventName] = useState("Pack Derby 2026");
  const [isPublic, setIsPublic] = useState(false);
  const [divisionInputs, setDivisionInputs] = useState(["Open Division"]);
  const [setupEventId, setSetupEventId] = useState<string | null>(null);
  const [createdDivisions, setCreatedDivisions] = useState<CreatedDivision[]>([]);
  const [selectedDivisionId, setSelectedDivisionId] = useState<string>("");
  const [phaseName, setPhaseName] = useState("Qualifying Round 1");
  const [raceType, setRaceType] = useState<RaceType>("heat");
  const [laneCount, setLaneCount] = useState(4);
  const [settingUp, setSettingUp] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [message, setMessage] = useState("");
  const [lastGenerationSummary, setLastGenerationSummary] = useState<string>("");

  function updateDivisionInput(index: number, value: string) {
    setDivisionInputs((previous) => previous.map((item, idx) => (idx === index ? value : item)));
  }

  function addDivisionInput() {
    setDivisionInputs((previous) => [...previous, ""]);
  }

  function removeDivisionInput(index: number) {
    setDivisionInputs((previous) => previous.filter((_, idx) => idx !== index));
  }

  async function handleSetupEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSettingUp(true);
    setMessage("");
    setLastGenerationSummary("");

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
        setMessage(data.error ?? "Failed to create race.");
        return;
      }

      const divisions = Array.isArray(data.divisions) ? data.divisions : [];
      setCreatedDivisions(divisions);
      setSetupEventId(data.eventId ?? null);
      setSelectedDivisionId(divisions[0]?.id ?? "");

      if (raceType === "heat") {
        setPhaseName("Qualifying Round 1");
      } else {
        setPhaseName("Tournament Bracket");
      }

      setMessage(data.message ?? "Event configured.");
    } catch {
      setMessage("Unable to reach server.");
    } finally {
      setSettingUp(false);
    }
  }

  async function handleGenerateRaces() {
    if (!selectedDivisionId) {
      return;
    }

    setGenerating(true);
    setMessage("");
    setLastGenerationSummary("");

    try {
      const response = await fetch("/api/races/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          divisionId: selectedDivisionId,
          raceType,
          phaseName,
          laneCount,
        }),
      });

      const data = (await response.json()) as GenerateRacesResponse;

      if (!response.ok) {
        setMessage(data.error ?? "Failed to generate races.");
        return;
      }

      const generated = data.racesCreated ?? 0;
      const included = data.carsIncluded ?? 0;
      const generatedLaneCount = data.laneCount ?? laneCount;
      setMessage(data.message ?? "Races generated.");
      setLastGenerationSummary(
        `Created ${generated} races using ${included} cars at ${generatedLaneCount} lanes.`
      );
    } catch {
      setMessage("Unable to reach server.");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <section className="mt-6 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Race Control</h2>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        Set up an event with multiple divisions first. Generate races later, after racers are registered and assigned.
      </p>

      <form onSubmit={handleSetupEvent} className="mt-4 space-y-3">
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
          disabled={settingUp}
          className="w-full rounded-lg bg-zinc-900 px-4 py-2 text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-70 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          {settingUp ? "Creating Event..." : "Create Event + Divisions"}
        </button>
      </form>

      {setupEventId && (
        <div className="mt-4 space-y-3 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
          <p className="text-xs font-mono text-zinc-600 dark:text-zinc-400">
            Event ID: {setupEventId}
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="targetDivision" className="mb-1 block text-sm">
                Division
              </label>
              <select
                id="targetDivision"
                value={selectedDivisionId}
                onChange={(event) => setSelectedDivisionId(event.target.value)}
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none ring-zinc-300 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              >
                {createdDivisions.map((division) => (
                  <option key={division.id} value={division.id}>
                    {division.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="raceType" className="mb-1 block text-sm">
                Race Type
              </label>
              <select
                id="raceType"
                value={raceType}
                onChange={(event) => setRaceType(event.target.value as RaceType)}
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none ring-zinc-300 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              >
                <option value="heat">Heat (Qualifying)</option>
                <option value="tournament">Tournament</option>
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="phaseName" className="mb-1 block text-sm">
              Phase Name
            </label>
            <input
              id="phaseName"
              value={phaseName}
              onChange={(event) => setPhaseName(event.target.value)}
              required
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none ring-zinc-300 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="laneCount" className="mb-1 block text-sm">
                Lane Count
              </label>
              <input
                id="laneCount"
                type="number"
                min={1}
                max={8}
                value={laneCount}
                onChange={(event) => setLaneCount(Number(event.target.value))}
                required
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none ring-zinc-300 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              />
            </div>
          </div>

          <button
            type="button"
            disabled={!selectedDivisionId || generating}
            onClick={handleGenerateRaces}
            className="w-full rounded-lg border border-zinc-300 bg-zinc-100 px-4 py-2 text-zinc-900 transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-70 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
          >
            {generating ? "Generating..." : "Generate Races For Division"}
          </button>
        </div>
      )}

      {lastGenerationSummary && (
        <p className="mt-3 rounded-md bg-zinc-100 px-3 py-2 text-xs font-mono dark:bg-zinc-900">
          {lastGenerationSummary}
        </p>
      )}

      {message && (
        <p className="mt-3 rounded-md bg-zinc-100 px-3 py-2 text-sm dark:bg-zinc-900">
          {message}
        </p>
      )}
    </section>
  );
}
