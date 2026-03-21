"use client";

import { useCallback, useEffect, useState } from "react";
import { useSerialGate, type SerialPacket } from "@/lib/serial-gate-context";

type LaneInfo = {
  laneNumber: number;
  carId: string;
  carNumber: number;
  carName: string;
  displayName: string;
  seedNumber: number | null;
  timeMs: number | null;
  resultCode: string | null;
  place: number | null;
};

type Race = {
  id: string;
  phaseId?: string;
  raceNumber: number;
  status: string;
  divisionName: string;
  phaseType?: string;
  roundNumber?: number | null;
  groupNumber?: number | null;
  lanes: LaneInfo[];
};

type ByeInfo = {
  carId: string;
  seedNumber: number;
  carNumber?: number;
  displayName?: string;
  carName?: string;
};

type TournamentPhaseInfo = {
  phaseId: string;
  divisionId: string;
  divisionName: string;
  phaseStatus: string;
  byes?: ByeInfo[];
};

type HeatResult = { raceNumber: number; timeMs: number };

type LeaderboardEntry = {
  carId: string;
  carNumber: number;
  carName: string;
  displayName: string;
  heats: HeatResult[];
  averageTimeMs: number;
  seed: number;
};

type LeaderboardDivision = {
  divisionName: string;
  entries: LeaderboardEntry[];
};

type QualifyingDivision = {
  divisionId: string;
  divisionName: string;
};

type RacesResponse = {
  races?: Race[];
  tournamentRaces?: Race[];
  tournamentPhases?: TournamentPhaseInfo[];
  qualifyingDivisions?: QualifyingDivision[];
  error?: string;
};
type ActionResponse = { message?: string; error?: string; tournamentDone?: boolean; roundComplete?: boolean };
type SlowestNonDnf = {
  timeMs: number;
  carNumber: number;
  carName: string;
  displayName: string;
  divisionName: string;
};
type LeaderboardResponse = {
  divisions?: LeaderboardDivision[];
  slowestNonDnf?: SlowestNonDnf | null;
  error?: string;
};
type LaneCaptureResult = {
  timeMs: number;
  resultCode: "finished" | "dnf";
};

function formatTime(ms: number): string {
  return (ms / 1000).toFixed(2);
}

function LaneTimer({
  lane,
  running,
  liveResult,
  onToggleDnf,
}: {
  lane: LaneInfo;
  running: boolean;
  liveResult: LaneCaptureResult | null;
  onToggleDnf?: () => void;
}) {
  const resultCode = lane.resultCode ?? liveResult?.resultCode ?? null;
  const hasResult = lane.timeMs != null || liveResult != null;
  const displayTime = lane.timeMs ?? liveResult?.timeMs ?? 0;
  const isDnf = resultCode === "dnf";

  return (
    <div className={`flex items-center gap-4 rounded-xl border px-4 py-3 ${
      hasResult
        ? "border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950"
        : running
          ? "border-blue-300 bg-blue-50 dark:border-blue-800 dark:bg-blue-950"
          : "border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900"
    }`}>
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-sm font-bold text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300">
        {lane.laneNumber}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
          {lane.seedNumber != null && (
            <span className="mr-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-purple-100 text-[10px] font-bold text-purple-700 dark:bg-purple-900 dark:text-purple-300">
              {lane.seedNumber}
            </span>
          )}
          #{lane.carNumber} {lane.displayName}
        </p>
        <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
          {lane.carName}
        </p>
      </div>

      <div className="text-right">
        <p className="font-mono text-xl font-bold tabular-nums text-zinc-900 dark:text-zinc-100">
          {formatTime(displayTime)}
        </p>
        {isDnf && (
          <p className="text-xs font-semibold text-rose-600 dark:text-rose-400">DNF</p>
        )}
        {lane.place != null && (
          <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
            {lane.place === 1 ? "1st" : lane.place === 2 ? "2nd" : `${lane.place}th`}
          </p>
        )}
      </div>

      {running && liveResult && onToggleDnf && (
        <button
          type="button"
          onClick={onToggleDnf}
          className={`shrink-0 rounded-lg px-3 py-2 text-xs font-medium transition ${
            isDnf
              ? "border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
              : "bg-rose-600 text-white hover:bg-rose-500"
          }`}
        >
          {isDnf ? "Undo DNF" : "Mark DNF"}
        </button>
      )}

      {hasResult ? (
        <span className={`shrink-0 text-xs font-medium ${
          isDnf ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"
        }`}>
          {isDnf ? "DNF" : "Done"}
        </span>
      ) : running ? (
        <span className="shrink-0 text-xs font-medium text-blue-600 dark:text-blue-400">
          Waiting
        </span>
      ) : null}
    </div>
  );
}

function RaceCard({
  race,
  role,
  eventId,
  onRaceFinished,
  serialPacket,
  gateConnected,
}: {
  race: Race;
  role: "current" | "on_deck" | "in_the_hole" | "finished" | "upcoming";
  eventId: string;
  onRaceFinished: () => void;
  serialPacket: SerialPacket | null;
  gateConnected: boolean;
}) {
  const [running, setRunning] = useState(race.status === "running");
  const [starting, setStarting] = useState(false);
  const [laneResults, setLaneResults] = useState<Map<number, LaneCaptureResult>>(new Map());
  const [submitting, setSubmitting] = useState(false);
  const [armedAtSequence, setArmedAtSequence] = useState(0);

  const allLanesFinished = race.lanes.every((l) => laneResults.has(l.laneNumber));

  const isAlreadyFinished = race.status === "finished";

  useEffect(() => {
    if (race.status === "running") setRunning(true);
    if (race.status === "finished") setRunning(false);
  }, [race.status]);

  async function handleStart() {
    if (starting) return;
    setStarting(true);
    try {
      const response = await fetch("/api/races/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raceId: race.id }),
      });
      const data = (await response.json()) as ActionResponse;
      if (!response.ok) {
        console.error(data.error ?? "Failed to start race");
        return;
      }
      setRunning(true);
      setLaneResults(new Map());
      setArmedAtSequence(serialPacket?.sequence ?? 0);
      onRaceFinished();
    } catch {
      console.error("Failed to start race");
    } finally {
      setStarting(false);
    }
  }

  useEffect(() => {
    if (!serialPacket || role !== "current" || !running || isAlreadyFinished) return;
    if (serialPacket.sequence <= armedAtSequence) return;

    setLaneResults((prev) => {
      const next = new Map(prev);
      for (const lane of race.lanes) {
        const serialTimeMs = serialPacket.laneTimesMs[lane.laneNumber];
        if (serialTimeMs == null) continue;
        const existing = next.get(lane.laneNumber);
        next.set(lane.laneNumber, {
          timeMs: serialTimeMs,
          resultCode: existing?.resultCode === "dnf" ? "dnf" : "finished",
        });
      }
      return next;
    });
  }, [serialPacket, role, running, isAlreadyFinished, race.lanes, armedAtSequence]);

  async function handleConfirmResults() {
    if (!running || !allLanesFinished || submitting || isAlreadyFinished) return;
    setSubmitting(true);
    try {
      const results = race.lanes.map((l) => {
        const captured = laneResults.get(l.laneNumber);
        return {
        laneNumber: l.laneNumber,
          timeMs: captured?.timeMs ?? null,
          resultCode: captured?.resultCode ?? "finished",
        };
      });

      if (results.some((r) => r.timeMs == null)) {
        console.error("Cannot confirm results: missing lane times.");
        return;
      }

      const response = await fetch(
        `/api/events/${eventId}/races/${race.id}/result`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            laneResults: results.map((r) => ({
              laneNumber: r.laneNumber,
              timeMs: r.timeMs as number,
              resultCode: r.resultCode,
            })),
          }),
        }
      );

      const data = (await response.json()) as ActionResponse;
      if (!response.ok) {
        console.error(data.error);
        return;
      }

      setRunning(false);
      onRaceFinished();
    } catch {
      console.error("Failed to submit results");
    } finally {
      setSubmitting(false);
    }
  }

  function handleRedoCapture() {
    setLaneResults(new Map());
  }

  function handleToggleDnf(laneNumber: number) {
    setLaneResults((prev) => {
      const existing = prev.get(laneNumber);
      if (!existing) return prev;
      const next = new Map(prev);
      next.set(laneNumber, {
        ...existing,
        resultCode: existing.resultCode === "dnf" ? "finished" : "dnf",
      });
      return next;
    });
  }

  const roleLabels: Record<string, { text: string; color: string }> = {
    current: { text: "Current Race", color: "bg-blue-600 text-white" },
    on_deck: { text: "On Deck", color: "bg-amber-500 text-white" },
    in_the_hole: { text: "In the Hole", color: "bg-zinc-500 text-white" },
    finished: { text: "Finished", color: "bg-emerald-600 text-white" },
    upcoming: { text: "Upcoming", color: "bg-zinc-300 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300" },
  };

  const label = roleLabels[role] ?? roleLabels.upcoming;

  return (
    <div className={`rounded-2xl border p-5 shadow-sm ${
      role === "current"
        ? "border-blue-300 bg-white dark:border-blue-800 dark:bg-zinc-950"
        : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
    }`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Heat {race.raceNumber}
          </h3>
          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
            {race.divisionName}
          </span>
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${label.color}`}>
            {label.text}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {role === "current" && !running && !isAlreadyFinished && (
            <button
              type="button"
              onClick={handleStart}
              disabled={!gateConnected || starting}
              className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white transition hover:bg-blue-500 disabled:opacity-50"
            >
              {starting ? "Starting..." : "Start Race"}
            </button>
          )}
          {role === "current" && running && !isAlreadyFinished && (
            <>
              <button
                type="button"
                onClick={handleRedoCapture}
                className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
              >
                Redo Capture
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmResults()}
                disabled={!allLanesFinished || submitting}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-50"
              >
                {submitting ? "Saving..." : "Confirm Results"}
              </button>
            </>
          )}
        </div>
      </div>

      {role === "current" && running && !isAlreadyFinished && (
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
          Listening for finish-gate response. Use Redo Capture to clear received lane times before confirming.
        </p>
      )}

      <div className="mt-3 space-y-2">
        {race.lanes.map((lane) => (
          <LaneTimer
            key={lane.laneNumber}
            lane={lane}
            running={running && role === "current"}
            liveResult={laneResults.get(lane.laneNumber) ?? null}
            onToggleDnf={
              running && role === "current"
                ? () => handleToggleDnf(lane.laneNumber)
                : undefined
            }
          />
        ))}
      </div>
    </div>
  );
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

function Leaderboard({
  eventId,
  refreshKey,
}: {
  eventId: string;
  refreshKey: number;
}) {
  const [divisions, setDivisions] = useState<LeaderboardDivision[]>([]);
  const [slowestNonDnf, setSlowestNonDnf] = useState<SlowestNonDnf | null>(null);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/events/${eventId}/leaderboard`, { cache: "no-store" });
        const data = (await res.json()) as LeaderboardResponse;
        if (res.ok) {
          if (data.divisions) setDivisions(data.divisions);
          setSlowestNonDnf(data.slowestNonDnf ?? null);
        }
      } catch {
        /* ignore */
      }
    }
    void load();
  }, [eventId, refreshKey]);

  if ((divisions.length === 0 || divisions.every((d) => d.entries.length === 0)) && !slowestNonDnf) {
    return null;
  }

  const maxHeats = divisions.length > 0
    ? Math.max(...divisions.flatMap((d) => d.entries.map((e) => e.heats.length)))
    : 0;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mb-3 flex w-full items-center gap-2 text-left"
      >
        <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Leaderboard
        </h3>
        <svg
          className={`h-4 w-4 text-zinc-400 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {slowestNonDnf && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-amber-950/30">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
            Slowest Non-DNF
          </p>
          <p className="mt-1 text-sm font-medium text-amber-800 dark:text-amber-200">
            #{slowestNonDnf.carNumber} {slowestNonDnf.displayName} ({slowestNonDnf.carName}) ·{" "}
            {formatTime(slowestNonDnf.timeMs)}s
          </p>
          <p className="text-xs text-amber-700/80 dark:text-amber-300/80">
            Division: {slowestNonDnf.divisionName}
          </p>
        </div>
      )}

      {open &&
        divisions.map((division) => (
          <div
            key={division.divisionName}
            className="mb-4 overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
          >
            <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-2 dark:border-zinc-800 dark:bg-zinc-900">
              <h4 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                {division.divisionName}
              </h4>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-zinc-100 dark:border-zinc-800">
                    <th className="whitespace-nowrap px-4 py-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                      Seed
                    </th>
                    <th className="whitespace-nowrap px-4 py-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                      Racer
                    </th>
                    <th className="whitespace-nowrap px-4 py-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                      Car
                    </th>
                    {Array.from({ length: maxHeats }, (_, i) => (
                      <th
                        key={i}
                        className="whitespace-nowrap px-4 py-2 text-right text-xs font-medium text-zinc-500 dark:text-zinc-400"
                      >
                        Heat {i + 1}
                      </th>
                    ))}
                    <th className="whitespace-nowrap px-4 py-2 text-right text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                      Avg
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {division.entries.map((entry) => (
                    <tr
                      key={entry.carId}
                      className="border-b border-zinc-50 last:border-0 dark:border-zinc-800/50"
                    >
                      <td className="whitespace-nowrap px-4 py-2">
                        <span
                          className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                            entry.seed === 1
                              ? "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300"
                              : entry.seed === 2
                                ? "bg-zinc-200 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300"
                                : entry.seed === 3
                                  ? "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300"
                                  : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                          }`}
                        >
                          {entry.seed}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 font-medium text-zinc-900 dark:text-zinc-100">
                        #{entry.carNumber} {entry.displayName}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 text-zinc-500 dark:text-zinc-400">
                        {entry.carName}
                      </td>
                      {Array.from({ length: maxHeats }, (_, i) => {
                        const heat = entry.heats[i];
                        return (
                          <td
                            key={i}
                            className="whitespace-nowrap px-4 py-2 text-right font-mono tabular-nums text-zinc-600 dark:text-zinc-400"
                          >
                            {heat ? `${formatTime(heat.timeMs)}s` : "—"}
                          </td>
                        );
                      })}
                      <td className="whitespace-nowrap px-4 py-2 text-right font-mono tabular-nums font-semibold text-zinc-900 dark:text-zinc-100">
                        {formatTime(entry.averageTimeMs)}s
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="border-t border-zinc-100 bg-zinc-50 px-4 py-2 dark:border-zinc-800 dark:bg-zinc-900">
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {division.entries.length} racer{division.entries.length !== 1 ? "s" : ""} ·{" "}
                {ordinal(1)} seed: #{division.entries[0]?.carNumber} {division.entries[0]?.displayName} ({formatTime(division.entries[0]?.averageTimeMs ?? 0)}s avg)
              </p>
            </div>
          </div>
        ))}
    </div>
  );
}

function TournamentBracket({
  races,
}: {
  races: Race[];
}) {
  if (races.length === 0) return null;

  const rounds = [...new Set(races.map((r) => r.roundNumber ?? 1))].sort((a, b) => a - b);
  const racesByRound = new Map<number, Race[]>();
  for (const round of rounds) {
    racesByRound.set(
      round,
      races
        .filter((r) => (r.roundNumber ?? 1) === round)
        .sort((a, b) => (a.groupNumber ?? 0) - (b.groupNumber ?? 0))
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex min-w-max items-start gap-4">
        {rounds.map((round) => (
          <div key={round} className="w-72 shrink-0 space-y-2">
            <h5 className="px-1 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Round {round}
            </h5>
            {(racesByRound.get(round) ?? []).map((race) => (
              <div
                key={race.id}
                className={`rounded-lg border bg-white p-2 dark:bg-zinc-950 ${
                  race.status === "finished"
                    ? "border-emerald-300 dark:border-emerald-800"
                    : race.status === "pending"
                      ? "border-purple-300 dark:border-purple-800"
                      : "border-zinc-200 dark:border-zinc-800"
                }`}
              >
                <p className="mb-1 text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                  Match {race.groupNumber}
                </p>
                <div className="space-y-1">
                  {race.lanes
                    .slice()
                    .sort((a, b) => a.laneNumber - b.laneNumber)
                    .map((lane) => {
                      const isWinner = lane.place === 1;
                      return (
                        <div
                          key={`${race.id}-${lane.laneNumber}`}
                          className={`rounded-md border px-2 py-1 text-xs ${
                            isWinner
                              ? "border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/40"
                              : "border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900"
                          }`}
                        >
                          <p className="font-medium text-zinc-800 dark:text-zinc-200">
                            {lane.seedNumber != null ? `(${lane.seedNumber}) ` : ""}#{lane.carNumber} {lane.displayName}
                          </p>
                          <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                            Lane {lane.laneNumber}
                            {lane.timeMs != null
                              ? lane.resultCode === "dnf"
                                ? ` · ${formatTime(lane.timeMs)}s · DNF`
                                : ` · ${formatTime(lane.timeMs)}s`
                              : ""}
                            {isWinner ? " · Winner" : ""}
                          </p>
                        </div>
                      );
                    })}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function TournamentRaceCard({
  race,
  isCurrent,
  eventId,
  onRaceFinished,
  serialPacket,
  gateConnected,
}: {
  race: Race;
  isCurrent: boolean;
  eventId: string;
  onRaceFinished: () => void;
  serialPacket: SerialPacket | null;
  gateConnected: boolean;
}) {
  const [lanes, setLanes] = useState(race.lanes);
  const [swapping, setSwapping] = useState(false);
  const [running, setRunning] = useState(race.status === "running");
  const [starting, setStarting] = useState(false);
  const [laneResults, setLaneResults] = useState<Map<number, LaneCaptureResult>>(new Map());
  const [submitting, setSubmitting] = useState(false);
  const [armedAtSequence, setArmedAtSequence] = useState(0);

  const isFinished = race.status === "finished";
  const allLanesFinished = lanes.every((l) => laneResults.has(l.laneNumber));

  useEffect(() => {
    if (race.status === "running") setRunning(true);
    if (race.status === "finished") setRunning(false);
  }, [race.status]);

  async function handleSwapLanes() {
    if (lanes.length !== 2) return;
    setSwapping(true);
    try {
      const swapped = [
        { laneNumber: 1, carId: lanes[1].carId },
        { laneNumber: 2, carId: lanes[0].carId },
      ];
      const res = await fetch(
        `/api/events/${eventId}/races/${race.id}/lanes`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lanes: swapped }),
        }
      );
      if (res.ok) {
        setLanes([
          { ...lanes[1], laneNumber: 1 },
          { ...lanes[0], laneNumber: 2 },
        ]);
      }
    } catch {
      /* ignore */
    } finally {
      setSwapping(false);
    }
  }

  async function handleStart() {
    if (starting) return;
    setStarting(true);
    try {
      const response = await fetch("/api/races/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raceId: race.id }),
      });
      const data = (await response.json()) as ActionResponse;
      if (!response.ok) {
        console.error(data.error ?? "Failed to start race");
        return;
      }
      setRunning(true);
      setLaneResults(new Map());
      setArmedAtSequence(serialPacket?.sequence ?? 0);
      onRaceFinished();
    } catch {
      console.error("Failed to start race");
    } finally {
      setStarting(false);
    }
  }

  useEffect(() => {
    if (!serialPacket || !isCurrent || !running || isFinished) return;
    if (serialPacket.sequence <= armedAtSequence) return;

    setLaneResults((prev) => {
      const next = new Map(prev);
      for (const lane of lanes) {
        const serialTimeMs = serialPacket.laneTimesMs[lane.laneNumber];
        if (serialTimeMs == null) continue;
        const existing = next.get(lane.laneNumber);
        next.set(lane.laneNumber, {
          timeMs: serialTimeMs,
          resultCode: existing?.resultCode === "dnf" ? "dnf" : "finished",
        });
      }
      return next;
    });
  }, [serialPacket, isCurrent, running, isFinished, lanes, armedAtSequence]);

  async function handleConfirmResults() {
    if (!running || !allLanesFinished || submitting || isFinished) return;
    setSubmitting(true);
    try {
      const results = lanes.map((l) => {
        const captured = laneResults.get(l.laneNumber);
        return {
        laneNumber: l.laneNumber,
          timeMs: captured?.timeMs ?? null,
          resultCode: captured?.resultCode ?? "finished",
        };
      });

      if (results.some((r) => r.timeMs == null)) {
        console.error("Cannot confirm results: missing lane times.");
        return;
      }

      const response = await fetch(
        `/api/events/${eventId}/races/${race.id}/result`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            laneResults: results.map((r) => ({
              laneNumber: r.laneNumber,
              timeMs: r.timeMs as number,
              resultCode: r.resultCode,
            })),
          }),
        }
      );
      if (response.ok) {
        setRunning(false);
        onRaceFinished();
      }
    } catch {
      /* ignore */
    } finally {
      setSubmitting(false);
    }
  }

  function handleRedoCapture() {
    setLaneResults(new Map());
  }

  function handleToggleDnf(laneNumber: number) {
    setLaneResults((prev) => {
      const existing = prev.get(laneNumber);
      if (!existing) return prev;
      const next = new Map(prev);
      next.set(laneNumber, {
        ...existing,
        resultCode: existing.resultCode === "dnf" ? "finished" : "dnf",
      });
      return next;
    });
  }

  return (
    <div
      className={`rounded-2xl border p-5 shadow-sm ${
        isCurrent && !isFinished
          ? "border-purple-300 bg-white dark:border-purple-800 dark:bg-zinc-950"
          : isFinished
            ? "border-emerald-200 bg-white dark:border-emerald-900 dark:bg-zinc-950"
            : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Round {race.roundNumber} · Match {race.groupNumber}
          </h3>
          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
            {race.divisionName}
          </span>
          {isFinished && (
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">
              Finished
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {isCurrent && !running && !isFinished && (
            <>
              <button
                type="button"
                onClick={() => void handleSwapLanes()}
                disabled={swapping}
                className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
              >
                {swapping ? "..." : "Swap Lanes"}
              </button>
              <button
                type="button"
                onClick={handleStart}
                disabled={!gateConnected || starting}
                className="rounded-lg bg-purple-600 px-5 py-2 text-sm font-medium text-white transition hover:bg-purple-500 disabled:opacity-50"
              >
                {starting ? "Starting..." : "Start Race"}
              </button>
            </>
          )}
          {isCurrent && running && !isFinished && (
            <>
              <button
                type="button"
                onClick={handleRedoCapture}
                className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
              >
                Redo Capture
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmResults()}
                disabled={!allLanesFinished || submitting}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-50"
              >
                {submitting ? "Saving..." : "Confirm Results"}
              </button>
            </>
          )}
          {submitting && (
            <span className="text-sm text-zinc-500 dark:text-zinc-400">Saving...</span>
          )}
        </div>
      </div>

      {isCurrent && running && !isFinished && (
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
          Listening for finish-gate response. Use Redo Capture to clear received lane times before confirming.
        </p>
      )}

      <div className="mt-3 space-y-2">
        {lanes.map((lane) => (
          <LaneTimer
            key={`${race.id}-${lane.laneNumber}`}
            lane={lane}
            running={running && isCurrent}
            liveResult={laneResults.get(lane.laneNumber) ?? null}
            onToggleDnf={
              running && isCurrent
                ? () => handleToggleDnf(lane.laneNumber)
                : undefined
            }
          />
        ))}
      </div>
    </div>
  );
}

function TournamentSection({
  eventId,
  tournamentRaces,
  tournamentPhases,
  qualifyingDivisionList,
  qualifyingDone,
  onDataChanged,
  serialPacket,
  gateConnected,
}: {
  eventId: string;
  tournamentRaces: Race[];
  tournamentPhases: TournamentPhaseInfo[];
  qualifyingDivisionList: QualifyingDivision[];
  qualifyingDone: boolean;
  onDataChanged: () => void;
  serialPacket: SerialPacket | null;
  gateConnected: boolean;
}) {
  const [startingDivId, setStartingDivId] = useState<string | null>(null);
  const [advancingPhaseId, setAdvancingPhaseId] = useState<string | null>(null);
  const [resettingDivId, setResettingDivId] = useState<string | null>(null);

  const startedDivisionIds = new Set(tournamentPhases.map((p) => p.divisionId));

  const uniqueQualifyingDivisions = [...new Map(
    qualifyingDivisionList.map((d) => [d.divisionId, d] as const)
  ).values()];

  const unstartedDivisions = uniqueQualifyingDivisions.filter(
    (d) => !startedDivisionIds.has(d.divisionId)
  );

  async function handleStartTournament(divisionId: string) {
    if (!confirm("Start the single-elimination tournament for this division?")) return;
    setStartingDivId(divisionId);
    try {
      const res = await fetch(
        `/api/events/${eventId}/divisions/${divisionId}/start-tournament`,
        { method: "POST" }
      );
      const data = (await res.json()) as ActionResponse;
      if (!res.ok) {
        alert(data.error ?? "Failed to start tournament");
        return;
      }
      onDataChanged();
    } catch {
      alert("Failed to start tournament");
    } finally {
      setStartingDivId(null);
    }
  }

  async function handleAdvanceRound(phaseId: string) {
    setAdvancingPhaseId(phaseId);
    try {
      const res = await fetch(`/api/events/${eventId}/advance-tournament`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phaseId }),
      });
      const data = (await res.json()) as ActionResponse;
      if (!res.ok) {
        alert(data.error ?? "Failed to advance tournament");
        return;
      }
      if (data.tournamentDone) {
        alert(data.message ?? "Tournament complete!");
      }
      onDataChanged();
    } catch {
      alert("Failed to advance tournament");
    } finally {
      setAdvancingPhaseId(null);
    }
  }

  async function handleResetTournament(divisionId: string) {
    if (!confirm("Reset this division tournament and start over from Round 1?")) return;
    setResettingDivId(divisionId);
    try {
      const res = await fetch(
        `/api/events/${eventId}/divisions/${divisionId}/reset-tournament`,
        { method: "POST" }
      );
      const data = (await res.json()) as ActionResponse;
      if (!res.ok) {
        alert(data.error ?? "Failed to reset tournament");
        return;
      }
      onDataChanged();
    } catch {
      alert("Failed to reset tournament");
    } finally {
      setResettingDivId(null);
    }
  }

  if (!qualifyingDone && tournamentPhases.length === 0) return null;

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        Tournament
      </h3>

      {qualifyingDone && unstartedDivisions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {unstartedDivisions.map((div) => (
            <button
              key={div.divisionId}
              type="button"
              disabled={startingDivId === div.divisionId}
              onClick={() => void handleStartTournament(div.divisionId)}
              className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-purple-500 disabled:opacity-50"
            >
              {startingDivId === div.divisionId
                ? "Starting..."
                : `Start Tournament — ${div.divisionName}`}
            </button>
          ))}
        </div>
      )}

      {tournamentPhases.map((phase) => {
        const phaseRaces = tournamentRaces.filter(
          (r) => r.phaseId === phase.phaseId
        );
        const rounds = [...new Set(phaseRaces.map((r) => r.roundNumber ?? 1))].sort(
          (a, b) => a - b
        );
        const currentRound = rounds[rounds.length - 1] ?? 1;
        const currentRoundRaces = phaseRaces.filter(
          (r) => r.roundNumber === currentRound
        );
        const previousRoundRaces = phaseRaces.filter(
          (r) => (r.roundNumber ?? 0) < currentRound
        );

        const allCurrentRoundFinished =
          currentRoundRaces.length > 0 &&
          currentRoundRaces.every((r) => r.status === "finished");
        const runningCurrentRound = currentRoundRaces.filter(
          (r) => r.status === "running"
        );
        const pendingCurrentRound = currentRoundRaces.filter(
          (r) => r.status === "pending"
        );
        const currentMatch = runningCurrentRound[0] ?? pendingCurrentRound[0] ?? null;

        const isChampionshipDecided =
          phase.phaseStatus === "completed" ||
          (allCurrentRoundFinished && currentRoundRaces.length === 1);

        let champion: LaneInfo | null = null;
        if (isChampionshipDecided && currentRoundRaces.length === 1) {
          const finalRace = currentRoundRaces[0];
          champion =
            finalRace.lanes.find((l) => l.place === 1) ?? null;
        }

        return (
          <div
            key={phase.phaseId}
            className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
          >
            <div className="flex items-center justify-between border-b border-zinc-200 bg-purple-50 px-4 py-3 dark:border-zinc-800 dark:bg-purple-950/30">
              <h4 className="text-sm font-semibold text-purple-800 dark:text-purple-300">
                {phase.divisionName} — Tournament
              </h4>
              <div className="flex items-center gap-3">
                <span className="text-xs text-purple-600 dark:text-purple-400">
                  Round {currentRound} · {currentRoundRaces.length} match
                  {currentRoundRaces.length !== 1 ? "es" : ""}
                </span>
                {isChampionshipDecided && (
                  <button
                    type="button"
                    disabled={resettingDivId === phase.divisionId}
                    onClick={() => void handleResetTournament(phase.divisionId)}
                    className="rounded-lg border border-purple-300 bg-white px-3 py-1 text-xs font-medium text-purple-700 transition hover:bg-purple-100 disabled:opacity-50 dark:border-purple-700 dark:bg-purple-900/20 dark:text-purple-300 dark:hover:bg-purple-900/40"
                  >
                    {resettingDivId === phase.divisionId ? "Resetting..." : "Reset Tournament"}
                  </button>
                )}
              </div>
            </div>

            {champion && (
              <div className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-center dark:border-amber-900 dark:bg-amber-950/30">
                <p className="text-lg font-bold text-amber-700 dark:text-amber-300">
                  Champion: #{champion.carNumber} {champion.displayName}
                </p>
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  {champion.carName}
                  {champion.timeMs != null ? ` · ${formatTime(champion.timeMs)}s` : ""}
                </p>
              </div>
            )}

            {phase.byes && phase.byes.length > 0 && currentRound === 1 && (
              <div className="border-b border-zinc-100 px-4 py-2 dark:border-zinc-800">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  Round 1 Byes
                </p>
                <div className="flex flex-wrap gap-2">
                  {phase.byes.map((bye) => (
                    <span
                      key={bye.carId}
                      className="inline-flex items-center gap-1.5 rounded-full border border-purple-200 bg-purple-50 px-3 py-1 text-xs dark:border-purple-800 dark:bg-purple-950/40"
                    >
                      <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-purple-200 text-[9px] font-bold text-purple-700 dark:bg-purple-800 dark:text-purple-300">
                        {bye.seedNumber}
                      </span>
                      <span className="font-medium text-purple-800 dark:text-purple-300">
                        #{bye.carNumber} {bye.displayName}
                      </span>
                      <span className="text-purple-500 dark:text-purple-400">
                        — advances to Round 2
                      </span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                Bracket
              </p>
              <TournamentBracket races={phaseRaces} />
            </div>

            <div className="space-y-3 p-4">
              {currentRoundRaces.map((race) => (
                <TournamentRaceCard
                  key={race.id}
                  race={race}
                  isCurrent={currentMatch?.id === race.id}
                  eventId={eventId}
                  onRaceFinished={onDataChanged}
                  serialPacket={serialPacket}
                  gateConnected={gateConnected}
                />
              ))}

              {allCurrentRoundFinished && !isChampionshipDecided && (
                <div className="flex justify-center pt-2">
                  <button
                    type="button"
                    disabled={advancingPhaseId === phase.phaseId}
                    onClick={() => void handleAdvanceRound(phase.phaseId)}
                    className="rounded-lg bg-purple-600 px-5 py-2 text-sm font-medium text-white transition hover:bg-purple-500 disabled:opacity-50"
                  >
                    {advancingPhaseId === phase.phaseId
                      ? "Generating..."
                      : `Advance to Round ${currentRound + 1}`}
                  </button>
                </div>
              )}
            </div>

            {previousRoundRaces.length > 0 && (
              <div className="border-t border-zinc-100 px-4 py-3 dark:border-zinc-800">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  Previous Rounds
                </p>
                <div className="space-y-1">
                  {previousRoundRaces.map((race) => (
                    <div
                      key={race.id}
                      className="flex items-center justify-between rounded-lg bg-zinc-50 px-3 py-2 text-xs dark:bg-zinc-900"
                    >
                      <span className="text-zinc-600 dark:text-zinc-400">
                        R{race.roundNumber} M{race.groupNumber}
                      </span>
                      <div className="flex gap-3">
                        {race.lanes
                          .sort((a, b) => (a.place ?? 99) - (b.place ?? 99))
                          .map((l) => (
                            <span key={l.laneNumber}>
                              <span className="font-medium text-zinc-700 dark:text-zinc-300">
                                {l.place === 1 ? "W" : "L"}
                              </span>{" "}
                              {l.seedNumber != null && (
                                <span className="text-purple-500 dark:text-purple-400">
                                  ({l.seedNumber})
                                </span>
                              )}{" "}
                              <span className="text-zinc-500 dark:text-zinc-400">
                                #{l.carNumber} {l.displayName}
                              </span>{" "}
                              <span className="font-mono tabular-nums text-zinc-400">
                                {l.timeMs != null
                                  ? l.resultCode === "dnf"
                                    ? `${formatTime(l.timeMs)}s (DNF)`
                                    : `${formatTime(l.timeMs)}s`
                                  : "—"}
                              </span>
                            </span>
                          ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function RaceDay({
  eventId,
  laneCount,
}: {
  eventId: string;
  laneCount: number;
}) {
  const [races, setRaces] = useState<Race[]>([]);
  const [tournamentRaces, setTournamentRaces] = useState<Race[]>([]);
  const [tournamentPhases, setTournamentPhases] = useState<TournamentPhaseInfo[]>([]);
  const [qualifyingDivisions, setQualifyingDivisions] = useState<QualifyingDivision[]>([]);
  const [loading, setLoading] = useState(true);
  const [resettingRaceId, setResettingRaceId] = useState<string | null>(null);
  const [leaderboardKey, setLeaderboardKey] = useState(0);
  const { serialPacket, serialConnected } = useSerialGate();

  async function handleRedoRace(raceId: string) {
    if (!confirm("Reset this heat and re-run it?")) return;
    setResettingRaceId(raceId);
    try {
      const res = await fetch(
        `/api/events/${eventId}/races/${raceId}/reset`,
        { method: "POST" }
      );
      const data = (await res.json()) as ActionResponse;
      if (!res.ok) {
        alert(data.error ?? "Failed to reset race");
        return;
      }
      await loadRaces();
    } catch {
      alert("Failed to reset race");
    } finally {
      setResettingRaceId(null);
    }
  }

  const loadRaces = useCallback(async () => {
    try {
      const response = await fetch(`/api/events/${eventId}/races`, { cache: "no-store" });
      const data = (await response.json()) as RacesResponse;
      if (response.ok) {
        setRaces(data.races ?? []);
        setTournamentRaces(data.tournamentRaces ?? []);
        setTournamentPhases(data.tournamentPhases ?? []);
        setQualifyingDivisions(data.qualifyingDivisions ?? []);
        setLeaderboardKey((k) => k + 1);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    void loadRaces();
  }, [loadRaces]);

  const runningRaces = races.filter((r) => r.status === "running");
  const pendingRaces = races.filter((r) => r.status === "pending");
  const finishedRaces = races.filter((r) => r.status === "finished");

  const hasRunningRace = runningRaces.length > 0;
  const currentRace = runningRaces[0] ?? pendingRaces[0] ?? null;
  const onDeckRace = hasRunningRace ? pendingRaces[0] ?? null : pendingRaces[1] ?? null;
  const inTheHoleRace = hasRunningRace ? pendingRaces[1] ?? null : pendingRaces[2] ?? null;

  const totalRaces = races.length;
  const finishedCount = finishedRaces.length;

  const qualifyingDivisionList = qualifyingDivisions;

  if (loading) {
    return <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading races...</p>;
  }

  if (races.length === 0) {
    return (
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          No heats generated yet. Complete registration first.
        </p>
      </div>
    );
  }

  const allDone = pendingRaces.length === 0 && runningRaces.length === 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between rounded-xl border border-zinc-200 bg-white px-5 py-3 dark:border-zinc-800 dark:bg-zinc-950">
        <div>
          <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Progress
          </p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {finishedCount} of {totalRaces} heats completed · {laneCount} lanes
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-2 w-32 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
            <div
              className="h-full rounded-full bg-blue-600 transition-all duration-500"
              style={{ width: `${totalRaces > 0 ? (finishedCount / totalRaces) * 100 : 0}%` }}
            />
          </div>
          <span className="text-sm font-bold tabular-nums text-zinc-700 dark:text-zinc-300">
            {totalRaces > 0 ? Math.round((finishedCount / totalRaces) * 100) : 0}%
          </span>
        </div>
      </div>

      {!serialConnected && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-3 dark:border-amber-800 dark:bg-amber-950/30">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
            Finish gate disconnected
          </p>
          <p className="text-xs text-amber-700 dark:text-amber-300">
            Reconnect from the bottom bar before starting the next race.
          </p>
        </div>
      )}

      {allDone ? (
        <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-6 text-center dark:border-emerald-800 dark:bg-emerald-950">
          <h2 className="text-xl font-semibold text-emerald-700 dark:text-emerald-300">
            All Qualifying Heats Complete!
          </h2>
          <p className="mt-2 text-sm text-emerald-600 dark:text-emerald-400">
            Start a tournament for each division below.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {currentRace && (
            <RaceCard
              key={currentRace.id}
              race={currentRace}
              role="current"
              eventId={eventId}
              onRaceFinished={() => void loadRaces()}
              serialPacket={serialPacket}
              gateConnected={serialConnected}
            />
          )}

          {onDeckRace && (
            <RaceCard
              key={onDeckRace.id}
              race={onDeckRace}
              role="on_deck"
              eventId={eventId}
              onRaceFinished={() => void loadRaces()}
              serialPacket={serialPacket}
              gateConnected={serialConnected}
            />
          )}

          {inTheHoleRace && (
            <RaceCard
              key={inTheHoleRace.id}
              race={inTheHoleRace}
              role="in_the_hole"
              eventId={eventId}
              onRaceFinished={() => void loadRaces()}
              serialPacket={serialPacket}
              gateConnected={serialConnected}
            />
          )}
        </div>
      )}

      {finishedRaces.length > 0 && (
        <Leaderboard eventId={eventId} refreshKey={leaderboardKey} />
      )}

      <TournamentSection
        eventId={eventId}
        tournamentRaces={tournamentRaces}
        tournamentPhases={tournamentPhases}
        qualifyingDivisionList={qualifyingDivisionList}
        qualifyingDone={allDone}
        onDataChanged={() => void loadRaces()}
        serialPacket={serialPacket}
        gateConnected={serialConnected}
      />

      {finishedRaces.length > 0 && (
        <div>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Completed Heats
          </h3>
          <div className="space-y-2">
            {finishedRaces.map((race) => (
              <div
                key={race.id}
                className="rounded-xl border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                      Heat {race.raceNumber}
                    </p>
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                      {race.divisionName}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={resettingRaceId === race.id}
                      onClick={() => void handleRedoRace(race.id)}
                      className="rounded-lg border border-zinc-300 bg-white px-3 py-1 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                    >
                      {resettingRaceId === race.id ? "Resetting..." : "Redo"}
                    </button>
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">
                      Finished
                    </span>
                  </div>
                </div>
                <div className="mt-2 flex gap-4">
                  {race.lanes
                    .sort((a, b) => (a.place ?? 99) - (b.place ?? 99))
                    .map((lane) => (
                      <div key={lane.laneNumber} className="text-xs">
                        <span className="font-medium text-zinc-700 dark:text-zinc-300">
                          {lane.place === 1 ? "🏆" : `${lane.place}.`}
                        </span>{" "}
                        <span className="text-zinc-600 dark:text-zinc-400">
                          #{lane.carNumber} {lane.displayName}
                        </span>{" "}
                        <span className="font-mono tabular-nums text-zinc-500 dark:text-zinc-400">
                          {lane.timeMs != null
                            ? lane.resultCode === "dnf"
                              ? `${formatTime(lane.timeMs)} (DNF)`
                              : `${formatTime(lane.timeMs)}s`
                            : "—"}
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
