"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";

const BAUDRATES = [9600, 19200, 38400, 57600, 115200] as const;

type LogEntry = {
  id: number;
  time: string;
  type: "text" | "raw" | "error" | "info";
  value: string;
};

declare global {
  interface Navigator {
    serial?: {
      requestPort(options?: { filters?: unknown[] }): Promise<SerialPort>;
      getPorts(): Promise<SerialPort[]>;
    };
  }
}

interface SerialPort {
  open(options: SerialOptions): Promise<void>;
  close(): Promise<void>;
  readable: ReadableStream<Uint8Array> | null;
  writable: WritableStream<Uint8Array> | null;
}

interface SerialOptions {
  baudRate: number;
  dataBits?: number;
  stopBits?: number;
  parity?: "none" | "even" | "odd";
  bufferSize?: number;
  flowControl?: "none" | "hardware";
}

export function SerialTestClient() {
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [baudRate, setBaudRate] = useState<number>(9600);
  const [mode, setMode] = useState<"text" | "chunks" | "raw">("chunks");
  const portRef = useRef<SerialPort | null>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | ReadableStreamDefaultReader<string> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const logIdRef = useRef(0);

  const addLog = useCallback((type: LogEntry["type"], value: string) => {
    const entry: LogEntry = {
      id: ++logIdRef.current,
      time: new Date().toLocaleTimeString("en-US", { hour12: false }),
      type,
      value,
    };
    setLog((prev) => [...prev.slice(-499), entry]);
  }, []);

  const clearLog = useCallback(() => setLog([]), []);

  const disconnect = useCallback(async () => {
    const port = portRef.current;
    abortRef.current?.abort();
    try {
      await readerRef.current?.cancel();
    } catch {
      // ignore
    }
    readerRef.current = null;
    try {
      if (port) await port.close();
    } catch {
      // ignore
    }
    portRef.current = null;
    setConnected(false);
    addLog("info", "Disconnected.");
  }, [addLog]);

  const connectAndRead = useCallback(async () => {
    if (!("serial" in navigator)) {
      setError("Web Serial is not supported. Use Chrome or Edge on macOS/Windows.");
      return;
    }
    setError(null);
    try {
      const port = await navigator.serial!.requestPort();
      await port.open({
        baudRate,
        dataBits: 8,
        stopBits: 1,
        parity: "none",
        bufferSize: 255,
        flowControl: "none",
      });
      portRef.current = port;
      setConnected(true);
      addLog("info", `Connected at ${baudRate} baud. Mode: ${mode}.`);

      const abort = new AbortController();
      abortRef.current = abort;

      if (mode === "text" || mode === "chunks") {
        const decoder = new TextDecoderStream();
        port.readable!.pipeTo(decoder.writable).catch(() => {});
        const textReader = decoder.readable.getReader();
        readerRef.current = textReader;
        const lineBuffer: string[] = [];
        try {
          while (!abort.signal.aborted) {
            const { value, done } = await textReader.read();
            if (done) break;
            const chunk = value ?? "";
            if (mode === "chunks") {
              if (chunk.length > 0) {
                const s = chunk.replace(/\r/g, "\\r").replace(/\n/g, "\\n");
                addLog("text", s);
              }
            } else {
              lineBuffer.push(chunk);
              const full = lineBuffer.join("");
              const lines = full.split(/\r?\n/);
              lineBuffer.length = 0;
              if (lines.length > 1) {
                for (let i = 0; i < lines.length - 1; i++) {
                  const line = lines[i]!.trim();
                  if (line) addLog("text", line);
                }
                const last = lines[lines.length - 1];
                if (last !== undefined && last !== "") lineBuffer.push(last);
              }
            }
          }
        } finally {
          readerRef.current = null;
          textReader.releaseLock();
        }
      } else {
        const reader = port.readable!.getReader();
        readerRef.current = reader;
        try {
          while (!abort.signal.aborted) {
            const { value, done } = await reader.read();
            if (done) break;
            if (value && value.length > 0) {
              const hex = Array.from(value)
                .map((b) => b.toString(16).padStart(2, "0"))
                .join(" ");
              const ascii = Array.from(value)
                .map((b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : "."))
                .join("");
              addLog("raw", `${hex}  |  ${ascii}`);
            }
          }
        } finally {
          reader.releaseLock();
          readerRef.current = null;
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("No port selected") || msg.includes("cancel")) {
        addLog("info", "Port selection cancelled.");
      } else {
        setError(msg);
        addLog("error", msg);
      }
    } finally {
      setConnected(false);
      portRef.current = null;
      abortRef.current = null;
    }
  }, [baudRate, mode, addLog]);

  const handleConnect = useCallback(() => {
    connectAndRead();
  }, [connectAndRead]);

  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-black">
      <nav className="w-full border-b border-zinc-200 bg-white px-6 py-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mx-auto flex w-full max-w-4xl items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="font-semibold text-zinc-900 hover:underline dark:text-zinc-100"
            >
              ← Racer
            </Link>
            <span className="text-zinc-500 dark:text-zinc-400">Serial test (MicroWizard)</span>
          </div>
        </div>
      </nav>

      <div className="mx-auto max-w-4xl space-y-6 p-6">
        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
            MicroWizard Fast Track — Web Serial test
          </h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Connect your finish gate via USB serial, choose baud rate and mode, then click Connect.
            The browser will ask you to select the serial port. Requires Chrome or Edge (HTTPS or localhost).
          </p>

          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm dark:border-amber-800 dark:bg-amber-950/30">
            <p className="font-medium text-amber-900 dark:text-amber-200">USB adapter not in the list?</p>
            <p className="mt-1 text-amber-800 dark:text-amber-300">
              If you only see Bluetooth/debug ports (e.g. <code className="rounded bg-amber-100 px-1 dark:bg-amber-900/50">cu.Bluetooth-Incoming-Port</code>, <code className="rounded bg-amber-100 px-1 dark:bg-amber-900/50">cu.debug-console</code>) and not your USB-serial adapter:
            </p>
            <ul className="mt-2 list-inside list-disc space-y-1 text-amber-800 dark:text-amber-300">
              <li>In Terminal run <code className="rounded bg-amber-100 px-1 font-mono text-xs dark:bg-amber-900/50">ls /dev/cu.*</code>. You should see something like <code className="rounded bg-amber-100 px-1 font-mono text-xs dark:bg-amber-900/50">cu.usbserial-*</code> or <code className="rounded bg-amber-100 px-1 font-mono text-xs dark:bg-amber-900/50">cu.usbmodem*</code> when the adapter is plugged in. If not, install the adapter driver (e.g. CH340, FTDI, CP210x) or try another cable/port.</li>
              <li>Chrome on macOS sometimes does not show USB serial devices in the Web Serial picker. Try <strong>Edge</strong> (Chromium) or a different USB port/dock.</li>
              <li>The console message about &quot;Serial blocklist&quot; and &quot;WH-1000XM4&quot; is Chrome hiding a <em>Bluetooth</em> serial device (e.g. headphones)—it does not mean your USB adapter is blocked.</li>
            </ul>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2">
              <span className="text-sm text-zinc-600 dark:text-zinc-400">Baud rate</span>
              <select
                value={baudRate}
                onChange={(e) => setBaudRate(Number(e.target.value))}
                disabled={connected}
                className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
              >
                {BAUDRATES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2">
              <span className="text-sm text-zinc-600 dark:text-zinc-400">Mode</span>
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as "text" | "raw")}
                disabled={connected}
                className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
              >
                <option value="chunks">Text (every chunk)</option>
                <option value="text">Text (line-based)</option>
                <option value="raw">Raw bytes (hex + ASCII)</option>
              </select>
            </label>
            {!connected ? (
              <button
                type="button"
                onClick={handleConnect}
                className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
              >
                Connect
              </button>
            ) : (
              <button
                type="button"
                onClick={disconnect}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-500"
              >
                Disconnect
              </button>
            )}
            <button
              type="button"
              onClick={clearLog}
              className="rounded-lg border border-zinc-300 px-4 py-2 text-sm transition hover:bg-zinc-100 dark:border-zinc-600 dark:hover:bg-zinc-800"
            >
              Clear log
            </button>
          </div>

          {error && (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-200">
              {error}
            </div>
          )}

          {connected && (
            <p className="mt-4 text-sm text-emerald-600 dark:text-emerald-400">
              Reading… Trigger the finish gate to see events.
            </p>
          )}
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <div className="border-b border-zinc-200 px-4 py-2 dark:border-zinc-800">
            <h2 className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Event log</h2>
          </div>
          <div className="max-h-[60vh] overflow-y-auto p-4 font-mono text-sm">
            {log.length === 0 ? (
              <p className="text-zinc-500 dark:text-zinc-400">No data yet. Connect and trigger the gate.</p>
            ) : (
              <ul className="space-y-1">
                {log.map((entry) => (
                  <li key={entry.id} className="flex gap-3">
                    <span className="shrink-0 text-zinc-500 dark:text-zinc-400">[{entry.time}]</span>
                    <span
                      className={
                        entry.type === "error"
                          ? "text-red-600 dark:text-red-400"
                          : entry.type === "info"
                            ? "text-blue-600 dark:text-blue-400"
                            : entry.type === "raw"
                              ? "text-amber-700 dark:text-amber-400"
                              : "text-zinc-900 dark:text-zinc-100"
                      }
                    >
                      {entry.value}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
