"use client";

import { SerialGateBottomBar } from "@/components/serial-gate-bottom-bar";
import { SerialGateProvider } from "@/lib/serial-gate-context";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <SerialGateProvider>
      {children}
      <SerialGateBottomBar />
    </SerialGateProvider>
  );
}
