"use client";

import { SerialGateBottomBar } from "@/components/serial-gate-bottom-bar";
import { SerialGateProvider } from "@/lib/serial-gate-context";
import { ThemeProvider } from "@/lib/theme-context";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <SerialGateProvider>
        {children}
        <SerialGateBottomBar />
      </SerialGateProvider>
    </ThemeProvider>
  );
}
