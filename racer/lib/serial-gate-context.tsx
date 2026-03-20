"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";

export type SerialPacket = {
  sequence: number;
  laneTimesMs: Record<number, number>;
  rawLine: string;
};

declare global {
  interface Navigator {
    serial?: {
      requestPort(options?: { filters?: unknown[] }): Promise<SerialPort>;
    };
  }
}

interface SerialPort {
  open(options: SerialOptions): Promise<void>;
  close(): Promise<void>;
  readable: ReadableStream<Uint8Array> | null;
}

interface SerialOptions {
  baudRate: number;
  dataBits?: number;
  stopBits?: number;
  parity?: "none" | "even" | "odd";
  bufferSize?: number;
  flowControl?: "none" | "hardware";
}

type SerialGateContextValue = {
  serialPacket: SerialPacket | null;
  serialConnected: boolean;
  serialConnecting: boolean;
  serialStatus: string;
  serialError: string | null;
  connectSerial: () => Promise<void>;
  disconnectSerial: () => Promise<void>;
};

const SerialGateContext = createContext<SerialGateContextValue | null>(null);

function laneLetterToNumber(letter: string): number | null {
  if (letter === "A") return 1;
  if (letter === "B") return 2;
  if (letter === "C") return 3;
  if (letter === "D") return 4;
  if (letter === "E") return 5;
  if (letter === "F") return 6;
  return null;
}

function parseSerialTimerLine(line: string): Record<number, number> | null {
  const laneTimesMs: Record<number, number> = {};
  const regex = /([A-F])\s*=\s*([0-9]+(?:\.[0-9]+)?)/g;
  let matched = false;
  let match: RegExpExecArray | null = regex.exec(line);

  while (match) {
    const laneNum = laneLetterToNumber(match[1]);
    const seconds = Number.parseFloat(match[2]);
    if (laneNum != null && Number.isFinite(seconds) && seconds > 0) {
      laneTimesMs[laneNum] = Math.round(seconds * 1000);
      matched = true;
    }
    match = regex.exec(line);
  }

  return matched ? laneTimesMs : null;
}

export function SerialGateProvider({ children }: { children: React.ReactNode }) {
  const [serialPacket, setSerialPacket] = useState<SerialPacket | null>(null);
  const [serialConnected, setSerialConnected] = useState(false);
  const [serialConnecting, setSerialConnecting] = useState(false);
  const [serialStatus, setSerialStatus] = useState("Disconnected");
  const [serialError, setSerialError] = useState<string | null>(null);
  const portRef = useRef<SerialPort | null>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<string> | null>(null);
  const sequenceRef = useRef(0);

  const disconnectSerial = useCallback(async () => {
    const port = portRef.current;
    try {
      await readerRef.current?.cancel();
    } catch {
      // ignore read cancellation errors
    }
    readerRef.current = null;
    try {
      if (port) await port.close();
    } catch {
      // ignore close errors
    }
    portRef.current = null;
    setSerialConnected(false);
    setSerialConnecting(false);
    setSerialStatus("Disconnected");
  }, []);

  const connectSerial = useCallback(async () => {
    if (!("serial" in navigator)) {
      setSerialError("Web Serial is not supported in this browser.");
      return;
    }

    setSerialError(null);
    setSerialConnecting(true);
    try {
      if (portRef.current) {
        try {
          await portRef.current.close();
        } catch {
          // ignore
        }
        portRef.current = null;
      }

      const port = await navigator.serial!.requestPort();
      const serialOptions: SerialOptions = {
        baudRate: 9600,
        dataBits: 8,
        stopBits: 1,
        parity: "none",
        bufferSize: 255,
        flowControl: "none",
      };

      try {
        await port.open(serialOptions);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        if (!msg.toLowerCase().includes("already open")) {
          throw error;
        }
        try {
          await port.close();
        } catch {
          // ignore
        }
        await port.open(serialOptions);
      }

      portRef.current = port;
      setSerialConnected(true);
      setSerialStatus("Connected at 9600 baud");

      const decoder = new TextDecoderStream();
      port.readable?.pipeTo(decoder.writable).catch(() => {});
      const reader = decoder.readable.getReader();
      readerRef.current = reader;

      let pending = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          const last = pending.trim();
          if (last) {
            const laneTimesMs = parseSerialTimerLine(last);
            if (laneTimesMs) {
              setSerialPacket({
                sequence: ++sequenceRef.current,
                laneTimesMs,
                rawLine: last,
              });
            }
          }
          break;
        }

        pending += value ?? "";
        const lines = pending.split(/\r?\n/);
        pending = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          const laneTimesMs = parseSerialTimerLine(trimmed);
          if (!laneTimesMs) continue;
          setSerialPacket({
            sequence: ++sequenceRef.current,
            laneTimesMs,
            rawLine: trimmed,
          });
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.toLowerCase().includes("cancel")) {
        setSerialError(message);
      }
    } finally {
      setSerialConnecting(false);
      setSerialConnected(false);
      try {
        readerRef.current?.releaseLock();
      } catch {
        // ignore
      }
      readerRef.current = null;
      try {
        await portRef.current?.close();
      } catch {
        // ignore
      }
      portRef.current = null;
      setSerialStatus("Disconnected");
    }
  }, []);

  const value = useMemo<SerialGateContextValue>(
    () => ({
      serialPacket,
      serialConnected,
      serialConnecting,
      serialStatus,
      serialError,
      connectSerial,
      disconnectSerial,
    }),
    [serialPacket, serialConnected, serialConnecting, serialStatus, serialError, connectSerial, disconnectSerial]
  );

  return <SerialGateContext.Provider value={value}>{children}</SerialGateContext.Provider>;
}

export function useSerialGate(): SerialGateContextValue {
  const context = useContext(SerialGateContext);
  if (!context) {
    throw new Error("useSerialGate must be used within a SerialGateProvider.");
  }
  return context;
}
