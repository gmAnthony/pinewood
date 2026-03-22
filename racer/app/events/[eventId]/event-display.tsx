"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, ArrowUp } from "lucide-react";
import { useTheme } from "@/lib/theme-context";

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
  officialCapturedAt?: string | null;
  lanes: LaneInfo[];
};

type TournamentPhaseInfo = {
  phaseId: string;
  divisionId: string;
  divisionName: string;
  phaseStatus: string;
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

type SlowestNonDnf = {
  timeMs: number;
  carNumber: number;
  carName: string;
  displayName: string;
  divisionName: string;
};

type LeaderboardEntry = {
  carId: string;
  carNumber: number;
  carName: string;
  displayName: string;
  averageTimeMs: number;
  seed: number;
};

type LeaderboardDivision = {
  divisionName: string;
  entries: LeaderboardEntry[];
};

type LeaderboardResponse = {
  divisions?: LeaderboardDivision[];
  slowestNonDnf?: SlowestNonDnf | null;
  error?: string;
};

type Registration = {
  carId: string;
  carNumber: number;
  carName: string;
  registrationStatus: string;
  displayName: string;
  divisionName: string;
};

type RegistrationsResponse = {
  registrations?: Registration[];
  error?: string;
};

const POLL_MS = 5000;
const SPECTATOR_ZOOM_STORAGE_KEY = "pinewood-spectator-zoom";
const SPECTATOR_ZOOM_DEFAULT = 115;
const SPECTATOR_ZOOM_MIN = 90;
const SPECTATOR_ZOOM_MAX = 160;
const SPECTATOR_ZOOM_STEP = 5;

function formatTime(ms: number): string {
  return (ms / 1000).toFixed(2);
}

function formatMph(ms: number, trackLengthFt: number): string {
  const miles = trackLengthFt / 5280;
  const hours = ms / 3_600_000;
  return (miles / hours).toFixed(1);
}

function isDnfResult(resultCode: string | null | undefined): boolean {
  return (resultCode ?? "").trim().toLowerCase() === "dnf";
}

function finishTimeMs(race: Race): number {
  const raw = race.officialCapturedAt;
  if (!raw) return 0;
  const ms = Date.parse(raw);
  return Number.isNaN(ms) ? 0 : ms;
}

function lastFinishedQualifyingRace(races: Race[]): Race | null {
  const finished = races.filter((r) => r.status === "finished");
  if (finished.length === 0) return null;
  return (
    [...finished].sort((a, b) => {
      const t = finishTimeMs(b) - finishTimeMs(a);
      if (t !== 0) return t;
      return b.raceNumber - a.raceNumber;
    })[0] ?? null
  );
}

function lastFinishedTournamentRace(races: Race[]): Race | null {
  const finished = races.filter((r) => r.status === "finished");
  if (finished.length === 0) return null;
  return (
    [...finished].sort((a, b) => {
      const t = finishTimeMs(b) - finishTimeMs(a);
      if (t !== 0) return t;
      if (b.raceNumber !== a.raceNumber) return b.raceNumber - a.raceNumber;
      const ra = a.roundNumber ?? 0;
      const rb = b.roundNumber ?? 0;
      if (rb !== ra) return rb - ra;
      return (b.groupNumber ?? 0) - (a.groupNumber ?? 0);
    })[0] ?? null
  );
}

function raceLabel(race: Race): string {
  if (race.phaseType === "tournament" || race.roundNumber != null) {
    return `R${race.roundNumber ?? 1} · M${race.groupNumber ?? "—"}`;
  }
  return `Heat ${race.raceNumber}`;
}

/** Most recently finished first; excludes `excludeId` (e.g. hero “latest result”). */
function getRecentFinishedRaces(
  qualifyingDone: boolean,
  hasTournamentActivity: boolean,
  qualifyingRaces: Race[],
  tournamentRaces: Race[],
  excludeId: string | null,
  limit: number
): Race[] {
  let pool: Race[] = [];
  let sortMode: "qualifying" | "tournament" = "qualifying";

  if (qualifyingDone && hasTournamentActivity) {
    pool = tournamentRaces.filter((r) => r.status === "finished");
    sortMode = "tournament";
  }
  if (pool.length === 0) {
    pool = qualifyingRaces.filter((r) => r.status === "finished");
    sortMode = "qualifying";
  }

  const sorted = [...pool].sort((a, b) => {
    const t = finishTimeMs(b) - finishTimeMs(a);
    if (t !== 0) return t;
    if (sortMode === "tournament") {
      if (b.raceNumber !== a.raceNumber) return b.raceNumber - a.raceNumber;
      const ra = a.roundNumber ?? 0;
      const rb = b.roundNumber ?? 0;
      if (rb !== ra) return rb - ra;
      return (b.groupNumber ?? 0) - (a.groupNumber ?? 0);
    }
    return b.raceNumber - a.raceNumber;
  });

  return sorted.filter((r) => r.id !== excludeId).slice(0, limit);
}

function RecentFinishesPanel({ races, trackLengthFt, eventId }: { races: Race[]; trackLengthFt: number | null; eventId: string }) {
  if (races.length === 0) return null;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <p className="shrink-0 border-b border-zinc-200 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
        Recent finishes
      </p>
      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-2">
        {races.map((race) => (
          <div
            key={race.id}
            className="rounded-lg border border-zinc-100 bg-zinc-50/90 px-2 py-1.5 dark:border-zinc-800 dark:bg-zinc-900/70"
          >
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="text-[11px] font-semibold text-zinc-800 dark:text-zinc-200">
                {raceLabel(race)}
              </span>
              <span className="rounded-full bg-zinc-200/80 px-1.5 py-0 text-[9px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                {race.divisionName}
              </span>
            </div>
            <div className="mt-1 flex flex-col gap-0.5">
              {race.lanes
                .slice()
                .sort((a, b) => (a.place ?? 99) - (b.place ?? 99))
                .map((lane) => {
                  const isDnf = isDnfResult(lane.resultCode);
                  return (
                    <div
                      key={lane.laneNumber}
                      className={`flex items-center justify-between gap-2 text-[10px] ${
                        lane.place === 1
                          ? "font-medium text-emerald-800 dark:text-emerald-300"
                          : "text-zinc-600 dark:text-zinc-400"
                      }`}
                    >
                      <Link
                        href={`/events/${eventId}/racers/${lane.carId}`}
                        className="min-w-0 truncate hover:underline"
                      >
                        <span className="font-mono text-zinc-500">L{lane.laneNumber}</span> #
                        {lane.carNumber} {lane.displayName}
                      </Link>
                      <span className="shrink-0 font-mono tabular-nums">
                        {isDnf ? "DNF" : lane.timeMs != null ? formatTime(lane.timeMs) : "—"}
                        {!isDnf && lane.timeMs != null && trackLengthFt != null && (
                          <span className="ml-1 text-[9px] text-zinc-400 dark:text-zinc-500">
                            {formatMph(lane.timeMs, trackLengthFt)} mph
                          </span>
                        )}
                        {!isDnf && lane.place != null && (
                          <span className="ml-1 text-[9px] font-semibold">
                            {lane.place === 1 ? "1st" : lane.place === 2 ? "2nd" : `${lane.place}th`}
                          </span>
                        )}
                      </span>
                    </div>
                  );
                })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function getTournamentPendingQueue(
  tournamentPhases: TournamentPhaseInfo[],
  tournamentRaces: Race[]
): Race[] {
  const queue: Race[] = [];
  for (const phase of tournamentPhases) {
    const phaseRaces = tournamentRaces.filter((r) => r.phaseId === phase.phaseId);
    if (phaseRaces.length === 0) continue;
    const rounds = [...new Set(phaseRaces.map((r) => r.roundNumber ?? 1))].sort((a, b) => a - b);
    const currentRound = rounds[rounds.length - 1] ?? 1;
    const pending = phaseRaces
      .filter((r) => r.roundNumber === currentRound && r.status === "pending")
      .sort((a, b) => (a.groupNumber ?? 0) - (b.groupNumber ?? 0));
    queue.push(...pending);
  }
  return queue;
}

function TournamentBracketReadOnly({ races, eventId }: { races: Race[]; eventId: string }) {
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
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-purple-200/80 bg-purple-50/50 dark:border-purple-900 dark:bg-purple-950/20">
      <p className="shrink-0 border-b border-purple-200/80 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-purple-700 dark:border-purple-900 dark:text-purple-300">
        Bracket
      </p>
      <div className="min-h-0 flex-1 overflow-hidden">
        <div className="flex h-full min-h-0 items-start gap-2 overflow-x-auto overflow-y-hidden p-2 pb-1">
          {rounds.map((round) => (
            <div key={round} className="flex w-[140px] shrink-0 flex-col gap-1">
              <h5 className="px-0.5 text-[9px] font-semibold uppercase text-purple-600 dark:text-purple-400">
                R{round}
              </h5>
              {(racesByRound.get(round) ?? []).map((race) => (
                <div
                  key={race.id}
                  className={`rounded border px-1.5 py-1 text-[10px] ${
                    race.status === "finished"
                      ? "border-emerald-300 bg-white dark:border-emerald-800 dark:bg-zinc-950"
                      : race.status === "pending"
                        ? "border-purple-300 bg-white dark:border-purple-900 dark:bg-zinc-950"
                        : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
                  }`}
                >
                  <p className="mb-0.5 font-medium text-zinc-500 dark:text-zinc-400">M{race.groupNumber}</p>
                  <div className="space-y-0.5">
                    {race.lanes
                      .slice()
                      .sort((a, b) => a.laneNumber - b.laneNumber)
                      .map((lane) => {
                        const isWinner = lane.place === 1;
                        return (
                          <div
                            key={`${race.id}-${lane.laneNumber}`}
                            className={`truncate rounded px-1 py-0.5 ${
                              isWinner
                                ? "bg-emerald-100/80 dark:bg-emerald-950/50"
                                : "bg-zinc-50 dark:bg-zinc-900"
                            }`}
                          >
                            <Link
                              href={`/events/${eventId}/racers/${lane.carId}`}
                              className="hover:underline"
                            >
                              <span className="font-medium text-zinc-800 dark:text-zinc-200">
                                #{lane.carNumber}
                              </span>{" "}
                              <span className="text-zinc-600 dark:text-zinc-400">{lane.displayName}</span>
                            </Link>
                            {lane.timeMs != null && (
                              <span className="ml-0.5 font-mono text-zinc-500">
                                {isDnfResult(lane.resultCode) ? " DNF" : ` ${formatTime(lane.timeMs)}`}
                              </span>
                            )}
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
    </div>
  );
}

function RacePanelReadOnly({
  race,
  label,
  variant,
  trackLengthFt,
  eventId,
}: {
  race: Race | null;
  label: string;
  variant: "hero" | "compact";
  trackLengthFt: number | null;
  eventId: string;
}) {
  const isHero = variant === "hero";
  const labelClass = label.includes("Previous")
    ? "bg-emerald-600 text-white"
    : isHero
      ? "bg-blue-600 text-white"
      : label.includes("Deck")
        ? "bg-amber-500 text-white"
        : "bg-zinc-500 text-white";

  if (!race) {
    return (
      <div
        className={`flex min-h-0 flex-col overflow-hidden rounded-xl border border-dashed border-zinc-300 bg-zinc-50/80 dark:border-zinc-700 dark:bg-zinc-900/40 ${
          isHero ? "p-4" : "p-2"
        }`}
      >
        <span className={`mb-2 inline-flex w-fit rounded-full px-2 py-0.5 text-[10px] font-semibold ${labelClass}`}>
          {label}
        </span>
        <p className={`text-zinc-500 dark:text-zinc-400 ${isHero ? "text-sm" : "text-xs"}`}>
          —
        </p>
      </div>
    );
  }

  const title =
    race.phaseType === "tournament"
      ? `R${race.roundNumber ?? 1} · M${race.groupNumber ?? "—"}`
      : `Heat ${race.raceNumber}`;

  const finished = race.status === "finished";

  return (
    <div
      className={`flex min-h-0 flex-col overflow-hidden rounded-xl border shadow-sm ${
        isHero
          ? "border-blue-300 bg-white dark:border-blue-800 dark:bg-zinc-950"
          : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
      } ${isHero ? "p-3" : "p-2"}`}
    >
      <div className="mb-2 flex min-w-0 flex-wrap items-center gap-2">
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${labelClass}`}>{label}</span>
        <span className={`font-semibold text-zinc-900 dark:text-zinc-100 ${isHero ? "text-lg" : "text-sm"}`}>
          {title}
        </span>
        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
          {race.divisionName}
        </span>
        {finished && (
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">
            Finished
          </span>
        )}
      </div>

      <div className={`min-h-0 space-y-1.5 ${isHero ? "" : "space-y-1"}`}>
        {race.lanes
          .slice()
          .sort((a, b) => a.laneNumber - b.laneNumber)
          .map((lane) => {
            const isDnf = isDnfResult(lane.resultCode);
            const place = lane.place;
            return (
              <div
                key={lane.laneNumber}
                className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 ${
                  finished && place === 1
                    ? "border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/40"
                    : "border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/60"
                } ${isHero ? "py-2.5" : ""}`}
              >
                <div
                  className={`flex shrink-0 items-center justify-center rounded-full bg-zinc-200 font-bold text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300 ${
                    isHero ? "h-9 w-9 text-sm" : "h-6 w-6 text-xs"
                  }`}
                >
                  {lane.laneNumber}
                </div>
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/events/${eventId}/racers/${lane.carId}`}
                    className={`block truncate font-medium text-zinc-900 hover:text-blue-600 hover:underline dark:text-zinc-100 dark:hover:text-blue-400 ${
                      isHero ? "text-base" : "text-xs"
                    }`}
                  >
                    {lane.seedNumber != null && (
                      <span className="mr-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-purple-100 text-[9px] font-bold text-purple-700 dark:bg-purple-900 dark:text-purple-300">
                        {lane.seedNumber}
                      </span>
                    )}
                    #{lane.carNumber} {lane.displayName}
                  </Link>
                  <p className="truncate text-[10px] text-zinc-500 dark:text-zinc-400">{lane.carName}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p
                    className={`font-mono font-bold tabular-nums text-zinc-900 dark:text-zinc-100 ${
                      isHero ? "text-2xl" : "text-sm"
                    }`}
                  >
                    {isDnf ? "DNF" : lane.timeMs != null ? formatTime(lane.timeMs) : "—"}
                  </p>
                  {!isDnf && lane.timeMs != null && trackLengthFt != null && (
                    <p className={`font-mono tabular-nums text-zinc-500 dark:text-zinc-400 ${isHero ? "text-sm" : "text-[10px]"}`}>
                      {formatMph(lane.timeMs, trackLengthFt)} mph
                    </p>
                  )}
                  {!isDnf && place != null && (
                    <p className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                      {place === 1 ? "1st" : place === 2 ? "2nd" : `${place}th`}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
}

function CompactLeaderboard({ divisions, trackLengthFt, eventId }: { divisions: LeaderboardDivision[]; trackLengthFt: number | null; eventId: string }) {
  if (divisions.length === 0) return null;
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <p className="shrink-0 border-b border-zinc-200 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
        Qualifying leaders
      </p>
      <div className="flex min-h-0 flex-1 gap-2 overflow-hidden p-2">
        {divisions.map((div) => (
          <div
            key={div.divisionName}
            className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-zinc-100 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/50"
          >
            <p className="shrink-0 truncate border-b border-zinc-200 px-2 py-1 text-[10px] font-semibold text-zinc-700 dark:border-zinc-800 dark:text-zinc-300">
              {div.divisionName}
            </p>
            <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-1">
              {div.entries.map((e) => (
                <li
                  key={e.carId}
                  className="flex items-center justify-between gap-1 truncate rounded px-1 text-[10px] text-zinc-700 dark:text-zinc-300"
                >
                  <Link
                    href={`/events/${eventId}/racers/${e.carId}`}
                    className="min-w-0 truncate hover:text-blue-600 hover:underline dark:hover:text-blue-400"
                  >
                    <span className="font-mono text-zinc-500">{e.seed}.</span> #{e.carNumber}{" "}
                    {e.displayName}
                  </Link>
                  <span className="shrink-0 font-mono tabular-nums text-zinc-600 dark:text-zinc-400">
                    {formatTime(e.averageTimeMs)}
                    {trackLengthFt != null && (
                      <span className="ml-1 text-[9px] text-zinc-400 dark:text-zinc-500">
                        {formatMph(e.averageTimeMs, trackLengthFt)}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

function CombinedRacersPanel({
  registrations,
  leaderboardDivisions,
  trackLengthFt,
  eventId,
}: {
  registrations: Registration[];
  leaderboardDivisions: LeaderboardDivision[];
  trackLengthFt: number | null;
  eventId: string;
}) {
  const leaderboardMap = useMemo(() => {
    const map = new Map<string, LeaderboardEntry>();
    for (const div of leaderboardDivisions) {
      for (const entry of div.entries) {
        map.set(entry.carId, entry);
      }
    }
    return map;
  }, [leaderboardDivisions]);

  const divisionGroups = useMemo(() => {
    const groups = new Map<string, Registration[]>();
    for (const reg of registrations) {
      if (reg.registrationStatus === "scratched") continue;
      const list = groups.get(reg.divisionName) ?? [];
      list.push(reg);
      groups.set(reg.divisionName, list);
    }
    for (const [, regs] of groups) {
      regs.sort((a, b) => {
        const aEntry = leaderboardMap.get(a.carId);
        const bEntry = leaderboardMap.get(b.carId);
        if (aEntry && bEntry) return aEntry.seed - bEntry.seed;
        if (aEntry) return -1;
        if (bEntry) return 1;
        return a.carNumber - b.carNumber;
      });
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [registrations, leaderboardMap]);

  if (divisionGroups.length === 0) return null;

  return (
    <div className="flex min-w-0 flex-col rounded-xl border border-zinc-200 bg-white lg:min-h-0 lg:flex-1 lg:overflow-hidden dark:border-zinc-800 dark:bg-zinc-950">
      <p className="shrink-0 border-b border-zinc-200 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
        Racers
      </p>
      <div className="flex flex-col gap-2 p-2 lg:min-h-0 lg:flex-1 lg:flex-row lg:overflow-hidden">
        {divisionGroups.map(([divName, regs]) => (
          <div
            key={divName}
            className="flex min-w-0 flex-col rounded-lg border border-zinc-100 bg-zinc-50 lg:flex-1 lg:overflow-hidden dark:border-zinc-800 dark:bg-zinc-900/50"
          >
            <p className="shrink-0 truncate border-b border-zinc-200 px-2 py-1 text-[10px] font-semibold text-zinc-700 dark:border-zinc-800 dark:text-zinc-300">
              {divName}
            </p>
            <ul className="space-y-0.5 p-1 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
              {regs.map((reg) => {
                const entry = leaderboardMap.get(reg.carId);
                return (
                  <li
                    key={reg.carId}
                    className="flex items-center justify-between gap-1 truncate rounded px-1 text-[10px] text-zinc-700 dark:text-zinc-300"
                  >
                    <Link
                      href={`/events/${eventId}/racers/${reg.carId}`}
                      className="min-w-0 truncate hover:text-blue-600 hover:underline dark:hover:text-blue-400"
                    >
                      {entry && (
                        <span className="font-mono text-zinc-500">{entry.seed}.</span>
                      )}{" "}
                      #{reg.carNumber} {reg.displayName}
                    </Link>
                    <span className="shrink-0 font-mono tabular-nums text-zinc-600 dark:text-zinc-400">
                      {entry ? (
                        <>
                          {formatTime(entry.averageTimeMs)}
                          {trackLengthFt != null && (
                            <span className="ml-1 text-[9px] text-zinc-400 dark:text-zinc-500">
                              {formatMph(entry.averageTimeMs, trackLengthFt)}
                            </span>
                          )}
                        </>
                      ) : (
                        "—"
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

export function EventDisplay({
  eventId,
  eventName,
  eventStatus,
  laneCount,
  trackLengthFt,
  divisions,
}: {
  eventId: string;
  eventName: string;
  eventStatus: string;
  laneCount: number;
  trackLengthFt: number | null;
  divisions: { id: string; name: string; sortOrder: number }[];
}) {
  const [racesData, setRacesData] = useState<RacesResponse | null>(null);
  const [leaderboardData, setLeaderboardData] = useState<LeaderboardResponse | null>(null);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [zoomPercent, setZoomPercent] = useState(() => {
    if (typeof window === "undefined") return SPECTATOR_ZOOM_DEFAULT;
    try {
      const raw = localStorage.getItem(SPECTATOR_ZOOM_STORAGE_KEY);
      if (raw != null) {
        const n = parseInt(raw, 10);
        if (
          !Number.isNaN(n) &&
          n >= SPECTATOR_ZOOM_MIN &&
          n <= SPECTATOR_ZOOM_MAX
        ) {
          return n;
        }
      }
    } catch {
      /* ignore */
    }
    return SPECTATOR_ZOOM_DEFAULT;
  });
  const { resolvedTheme, toggleTheme } = useTheme();
  const skipZoomSave = useRef(true);

  useEffect(() => {
    if (skipZoomSave.current) {
      skipZoomSave.current = false;
      return;
    }
    try {
      localStorage.setItem(SPECTATOR_ZOOM_STORAGE_KEY, String(zoomPercent));
    } catch {
      /* ignore */
    }
  }, [zoomPercent]);

  const loadAll = useCallback(async () => {
    try {
      const [rRes, lRes, regRes] = await Promise.all([
        fetch(`/api/events/${eventId}/races`, { cache: "no-store" }),
        fetch(`/api/events/${eventId}/leaderboard`, { cache: "no-store" }),
        fetch(`/api/events/${eventId}/register`, { cache: "no-store" }),
      ]);

      const rJson = (await rRes.json()) as RacesResponse;
      const lJson = (await lRes.json()) as LeaderboardResponse;
      const regJson = (await regRes.json()) as RegistrationsResponse;

      if (!rRes.ok) {
        setLoadError(rJson.error ?? "Failed to load races");
      } else {
        setLoadError(null);
        setRacesData(rJson);
      }
      if (lRes.ok) setLeaderboardData(lJson);
      if (regRes.ok && regJson.registrations) setRegistrations(regJson.registrations);
    } catch {
      setLoadError("Network error");
    }
  }, [eventId]);

  useEffect(() => {
    const t = window.setTimeout(() => void loadAll(), 0);
    const id = window.setInterval(() => void loadAll(), POLL_MS);
    return () => {
      window.clearTimeout(t);
      window.clearInterval(id);
    };
  }, [loadAll]);

  const qualifyingRaces = useMemo(() => racesData?.races ?? [], [racesData?.races]);
  const tournamentRaces = useMemo(() => racesData?.tournamentRaces ?? [], [racesData?.tournamentRaces]);
  const tournamentPhases = useMemo(() => racesData?.tournamentPhases ?? [], [racesData?.tournamentPhases]);

  const pendingQualifying = qualifyingRaces.filter((r) => r.status === "pending");
  const runningQualifying = qualifyingRaces.filter((r) => r.status === "running");
  const finishedQualifying = qualifyingRaces.filter((r) => r.status === "finished");
  const qualifyingDone =
    qualifyingRaces.length > 0 &&
    pendingQualifying.length === 0 &&
    runningQualifying.length === 0;

  const tournamentQueue = useMemo(
    () => getTournamentPendingQueue(tournamentPhases, tournamentRaces),
    [tournamentPhases, tournamentRaces]
  );

  const hasTournamentActivity = tournamentPhases.length > 0 && tournamentRaces.length > 0;
  const runningTournament = tournamentRaces
    .filter((r) => r.status === "running")
    .sort((a, b) => {
      if ((a.roundNumber ?? 0) !== (b.roundNumber ?? 0)) {
        return (a.roundNumber ?? 0) - (b.roundNumber ?? 0);
      }
      return (a.groupNumber ?? 0) - (b.groupNumber ?? 0);
    });

  const lastFinishedQualifying = lastFinishedQualifyingRace(qualifyingRaces);
  const lastFinishedTournament = lastFinishedTournamentRace(tournamentRaces);

  const previousRace: Race | null = qualifyingDone
    ? lastFinishedTournament ?? lastFinishedQualifying
    : lastFinishedQualifying;

  const currentRace: Race | null = qualifyingDone
    ? runningTournament[0] ?? tournamentQueue[0] ?? null
    : runningQualifying[0] ?? pendingQualifying[0] ?? null;

  const pendingOffset = currentRace?.status === "pending" ? 1 : 0;
  const onDeckRace: Race | null = qualifyingDone
    ? tournamentQueue[pendingOffset] ?? null
    : pendingQualifying[pendingOffset] ?? null;
  const inTheHoleRace: Race | null = qualifyingDone
    ? tournamentQueue[pendingOffset + 1] ?? null
    : pendingQualifying[pendingOffset + 1] ?? null;

  const divisionNameForCars =
    previousRace?.divisionName ??
    currentRace?.divisionName ??
    onDeckRace?.divisionName ??
    divisions[0]?.name ??
    null;

  const slowestNonDnf = leaderboardData?.slowestNonDnf ?? null;
  const leaderboardDivisions = leaderboardData?.divisions ?? [];

  const totalQualifying = qualifyingRaces.length;
  const progressPct =
    totalQualifying > 0 ? Math.round((finishedQualifying.length / totalQualifying) * 100) : 0;

  return (
    <div
      className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-3 pb-3 pt-2 lg:overflow-hidden"
      style={{ zoom: zoomPercent / 100 }}
    >
      <div className="shrink-0 rounded-xl border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold text-zinc-900 dark:text-zinc-100 md:text-xl">
              {eventName}
            </h1>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
              <span className="capitalize">{eventStatus}</span>
              {" · "}
              {laneCount} lanes
              {trackLengthFt != null && (
                <>
                  {" · "}
                  {trackLengthFt} ft track
                </>
              )}
              {divisionNameForCars && (
                <>
                  {" · "}
                  <span className="font-medium text-zinc-600 dark:text-zinc-300">
                    Division: {divisionNameForCars}
                  </span>
                </>
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-3">
            <button
              type="button"
              onClick={toggleTheme}
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-zinc-200 bg-zinc-100 text-zinc-600 transition-colors hover:bg-zinc-200 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
              aria-label={resolvedTheme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              title={resolvedTheme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            >
              {resolvedTheme === "dark" ? (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                  <path d="M10 2a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0v-1.5A.75.75 0 0 1 10 2ZM10 15a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0v-1.5A.75.75 0 0 1 10 15ZM10 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM15.657 5.404a.75.75 0 1 0-1.06-1.06l-1.061 1.06a.75.75 0 0 0 1.06 1.06l1.06-1.06ZM6.464 14.596a.75.75 0 1 0-1.06-1.06l-1.06 1.06a.75.75 0 0 0 1.06 1.06l1.06-1.06ZM18 10a.75.75 0 0 1-.75.75h-1.5a.75.75 0 0 1 0-1.5h1.5A.75.75 0 0 1 18 10ZM5 10a.75.75 0 0 1-.75.75h-1.5a.75.75 0 0 1 0-1.5h1.5A.75.75 0 0 1 5 10ZM14.596 15.657a.75.75 0 0 0 1.06-1.06l-1.06-1.061a.75.75 0 1 0-1.06 1.06l1.06 1.06ZM5.404 6.464a.75.75 0 0 0 1.06-1.06l-1.06-1.06a.75.75 0 1 0-1.06 1.06l1.06 1.06Z" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                  <path fillRule="evenodd" d="M7.455 2.004a.75.75 0 0 1 .26.77 7 7 0 0 0 9.958 7.967.75.75 0 0 1 1.067.853A8.5 8.5 0 1 1 6.647 1.921a.75.75 0 0 1 .808.083Z" clipRule="evenodd" />
                </svg>
              )}
            </button>
            <div className="flex items-center gap-2">
              <label
                htmlFor="spectator-display-size"
                className="whitespace-nowrap text-[10px] font-medium text-zinc-600 dark:text-zinc-400"
              >
                Display size
              </label>
              <input
                id="spectator-display-size"
                type="range"
                min={SPECTATOR_ZOOM_MIN}
                max={SPECTATOR_ZOOM_MAX}
                step={SPECTATOR_ZOOM_STEP}
                value={zoomPercent}
                onChange={(e) => setZoomPercent(Number(e.target.value))}
                className="h-1.5 w-20 cursor-pointer accent-zinc-900 dark:accent-zinc-100 sm:w-28"
                aria-valuemin={SPECTATOR_ZOOM_MIN}
                aria-valuemax={SPECTATOR_ZOOM_MAX}
                aria-valuenow={zoomPercent}
                aria-label="Display size"
              />
              <span className="w-10 tabular-nums text-[10px] text-zinc-500 dark:text-zinc-400">
                {zoomPercent}%
              </span>
            </div>
            {totalQualifying > 0 && (
              <div className="flex items-center gap-2">
                <div className="h-1.5 w-24 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700 md:w-36">
                  <div
                    className="h-full rounded-full bg-blue-600 transition-all duration-500"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
                <span className="text-xs font-bold tabular-nums text-zinc-600 dark:text-zinc-400">
                  {finishedQualifying.length}/{totalQualifying} heats
                </span>
              </div>
            )}
          </div>
        </div>
        {loadError && (
          <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">{loadError}</p>
        )}
      </div>

      <div className="grid shrink-0 grid-cols-1 gap-2 lg:grid-cols-[minmax(0,1fr)_24px_minmax(0,1fr)]">
        <RacePanelReadOnly
          race={previousRace}
          label="Previous race"
          variant="hero"
          trackLengthFt={trackLengthFt}
          eventId={eventId}
        />
        <div className="hidden items-center justify-center lg:flex">
          <ArrowLeft className="h-5 w-5 text-zinc-400 dark:text-zinc-600" strokeWidth={2} />
        </div>
        <RacePanelReadOnly
          race={currentRace}
          label={currentRace?.status === "running" ? "Current race" : "Next race"}
          variant="hero"
          trackLengthFt={trackLengthFt}
          eventId={eventId}
        />
      </div>

      <div className="grid shrink-0 grid-cols-1 gap-2 lg:grid-cols-[minmax(0,1fr)_24px_minmax(0,1fr)]">
        <div />
        <div />
        <div className="hidden items-center justify-center py-0.5 lg:flex">
          <ArrowUp className="h-4 w-4 text-zinc-400 dark:text-zinc-600" strokeWidth={2} />
        </div>
      </div>

      <div className="grid shrink-0 grid-cols-1 gap-2 lg:grid-cols-[minmax(0,1fr)_24px_minmax(0,1fr)]">
        <RacePanelReadOnly race={inTheHoleRace} label="In the hole" variant="compact" trackLengthFt={trackLengthFt} eventId={eventId} />
        <div className="hidden items-center justify-center lg:flex">
          <ArrowRight className="h-4 w-4 text-zinc-400 dark:text-zinc-600" strokeWidth={2} />
        </div>
        <RacePanelReadOnly race={onDeckRace} label="On deck" variant="compact" trackLengthFt={trackLengthFt} eventId={eventId} />
      </div>

      <div className="grid grid-cols-1 gap-2 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,220px)] lg:overflow-hidden">
        <div className="flex min-w-0 flex-col gap-2 lg:min-h-0 lg:flex-row lg:overflow-hidden">
          {hasTournamentActivity && qualifyingDone &&
            tournamentPhases.map((phase) => (
              <div key={phase.phaseId} className="min-w-0 flex-1">
                <TournamentBracketReadOnly
                  races={tournamentRaces.filter((r) => r.phaseId === phase.phaseId)}
                  eventId={eventId}
                />
              </div>
            ))}
          <CombinedRacersPanel
            registrations={registrations}
            leaderboardDivisions={leaderboardDivisions}
            trackLengthFt={trackLengthFt}
            eventId={eventId}
          />
        </div>

        <div className="flex min-h-0 flex-col justify-center overflow-hidden rounded-xl border-2 border-amber-300/80 bg-linear-to-br from-amber-50 to-amber-100/80 px-3 py-2 dark:border-amber-700 dark:from-amber-950/40 dark:to-amber-950/20">
          <p className="text-center text-[10px] font-bold uppercase tracking-widest text-amber-800 dark:text-amber-200">
            The Golden Turtle
          </p>
          <p className="text-center text-[9px] text-amber-700/90 dark:text-amber-300/80">
            Slowest finishing time (all races, non-DNF)
          </p>
          {slowestNonDnf ? (
            <div className="mt-2 text-center">
              <p className="font-mono text-2xl font-bold tabular-nums text-amber-900 dark:text-amber-100 md:text-3xl">
                {formatTime(slowestNonDnf.timeMs)}s
              </p>
              {trackLengthFt != null && (
                <p className="font-mono text-sm tabular-nums text-amber-800/80 dark:text-amber-200/80">
                  {formatMph(slowestNonDnf.timeMs, trackLengthFt)} mph
                </p>
              )}
              <p className="mt-1 truncate text-sm font-semibold text-amber-900 dark:text-amber-100">
                #{slowestNonDnf.carNumber} {slowestNonDnf.displayName}
              </p>
              <p className="truncate text-[11px] text-amber-800/90 dark:text-amber-200/90">
                {slowestNonDnf.carName} · {slowestNonDnf.divisionName}
              </p>
            </div>
          ) : (
            <p className="mt-3 text-center text-xs text-amber-800/70 dark:text-amber-300/70">
              No official times yet
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
