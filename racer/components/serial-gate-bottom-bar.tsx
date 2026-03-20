"use client";

import { usePathname } from "next/navigation";
import { useSerialGate } from "@/lib/serial-gate-context";

export function SerialGateBottomBar() {
  const pathname = usePathname();
  const {
    serialPacket,
    serialConnected,
    serialConnecting,
    serialStatus,
    serialError,
    connectSerial,
    disconnectSerial,
  } = useSerialGate();

  const shouldShow = pathname.includes("/events/") && pathname.includes("/race");
  if (!shouldShow) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-zinc-200 bg-white/95 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Finish Gate
          </p>
          <p className="truncate text-sm text-zinc-700 dark:text-zinc-300">
            {serialStatus}
            {serialPacket ? ` · last: ${serialPacket.rawLine}` : ""}
          </p>
          {serialError && (
            <p className="truncate text-xs text-red-600 dark:text-red-400">{serialError}</p>
          )}
        </div>
        {serialConnected ? (
          <button
            type="button"
            onClick={() => void disconnectSerial()}
            className="rounded-lg bg-red-600 px-3 py-2 text-xs font-medium text-white transition hover:bg-red-500"
          >
            Disconnect
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void connectSerial()}
            disabled={serialConnecting}
            className="rounded-lg bg-zinc-900 px-3 py-2 text-xs font-medium text-white transition hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            {serialConnecting ? "Connecting..." : "Connect Gate"}
          </button>
        )}
      </div>
    </div>
  );
}
