"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { InspectionPanel } from "./inspection-panel";

type Division = {
  id: string;
  name: string;
};

type InspectionProgress = {
  completed: number;
  total: number;
};

type Registration = {
  carId: string;
  carNumber: number;
  carName: string;
  registrationStatus: string;
  firstName: string;
  lastName: string;
  displayName: string;
  age: number | null;
  divisionName: string;
  inspectionStatus: string;
  inspectionProgress: InspectionProgress;
  paymentAmount: number;
  paymentStatus: string;
};

type RegisterResponse = { message?: string; error?: string };
type RegistrationsResponse = { registrations?: Registration[]; error?: string };
type ActionResponse = { message?: string; error?: string };

function InspectionBadge({ status, progress }: { status: string; progress: InspectionProgress }) {
  if (status === "approved") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
        Approved
      </span>
    );
  }
  if (status === "changes_requested") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900 dark:text-amber-300">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500" />
        Changes
      </span>
    );
  }
  if (status === "scratched") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900 dark:text-red-300">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-red-500" />
        Scratched
      </span>
    );
  }
  if (progress.completed === 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-zinc-200 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
        Not started
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900 dark:text-blue-300">
      {progress.completed}/{progress.total}
    </span>
  );
}

function PaymentBadge({ amount, status }: { amount: number; status: string }) {
  const label = amount === 0 ? "Free" : `$${amount}`;
  if (status === "paid") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">
        {label} Paid
      </span>
    );
  }
  if (amount === 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-zinc-200 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
        Free
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900 dark:text-amber-300">
      {label} Unpaid
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "scratched") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900 dark:text-red-300">
        Scratched
      </span>
    );
  }
  return null;
}

export function RegistrationForm({
  eventId,
  divisions,
}: {
  eventId: string;
  divisions: Division[];
}) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [age, setAge] = useState("");
  const [carName, setCarName] = useState("");
  const [divisionId, setDivisionId] = useState(divisions[0]?.id ?? "");
  const [paymentAmount, setPaymentAmount] = useState<number>(10);
  const [paymentStatus, setPaymentStatus] = useState<"paid" | "pay_later">("pay_later");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error">("success");

  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [loadingRegistrations, setLoadingRegistrations] = useState(true);
  const [inspectingCarId, setInspectingCarId] = useState<string | null>(null);
  const [busyCarId, setBusyCarId] = useState<string | null>(null);
  const [showScratched, setShowScratched] = useState(false);
  const [startingHeats, setStartingHeats] = useState(false);
  const router = useRouter();

  const loadRegistrations = useCallback(async () => {
    setLoadingRegistrations(true);
    try {
      const response = await fetch(`/api/events/${eventId}/register`);
      const data = (await response.json()) as RegistrationsResponse;
      if (response.ok && data.registrations) {
        setRegistrations(data.registrations);
      }
    } catch {
      // silently fail
    } finally {
      setLoadingRegistrations(false);
    }
  }, [eventId]);

  useEffect(() => {
    void loadRegistrations();
  }, [loadRegistrations]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setMessage("");

    try {
      const response = await fetch(`/api/events/${eventId}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName,
          lastName,
          age: age ? Number(age) : null,
          carName,
          divisionId,
          paymentAmount,
          paymentStatus,
        }),
      });
      const data = (await response.json()) as RegisterResponse;
      if (!response.ok) {
        setMessage(data.error ?? "Registration failed.");
        setMessageType("error");
        return;
      }
      setMessage(data.message ?? "Registered successfully.");
      setMessageType("success");
      setFirstName("");
      setLastName("");
      setAge("");
      setCarName("");
      setPaymentAmount(10);
      setPaymentStatus("pay_later");
      void loadRegistrations();
    } catch {
      setMessage("Unable to reach server.");
      setMessageType("error");
    } finally {
      setSubmitting(false);
    }
  }

  async function scratchCar(carId: string) {
    if (!window.confirm("Scratch this racer? They will be excluded from races.")) return;
    setBusyCarId(carId);
    try {
      const response = await fetch(`/api/events/${eventId}/cars/${carId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registrationStatus: "scratched" }),
      });
      const data = (await response.json()) as ActionResponse;
      if (!response.ok) {
        setMessage(data.error ?? "Failed to scratch.");
        setMessageType("error");
        return;
      }
      setInspectingCarId(null);
      void loadRegistrations();
    } catch {
      setMessage("Unable to reach server.");
      setMessageType("error");
    } finally {
      setBusyCarId(null);
    }
  }

  async function unScratchCar(carId: string) {
    setBusyCarId(carId);
    try {
      const response = await fetch(`/api/events/${eventId}/cars/${carId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registrationStatus: "registered" }),
      });
      const data = (await response.json()) as ActionResponse;
      if (!response.ok) {
        setMessage(data.error ?? "Failed to restore.");
        setMessageType("error");
        return;
      }
      void loadRegistrations();
    } catch {
      setMessage("Unable to reach server.");
      setMessageType("error");
    } finally {
      setBusyCarId(null);
    }
  }

  async function deleteCar(carId: string) {
    if (!window.confirm("Permanently delete this racer and car? This cannot be undone.")) return;
    setBusyCarId(carId);
    try {
      const response = await fetch(`/api/events/${eventId}/cars/${carId}`, {
        method: "DELETE",
      });
      const data = (await response.json()) as ActionResponse;
      if (!response.ok) {
        setMessage(data.error ?? "Failed to delete.");
        setMessageType("error");
        return;
      }
      if (inspectingCarId === carId) setInspectingCarId(null);
      void loadRegistrations();
    } catch {
      setMessage("Unable to reach server.");
      setMessageType("error");
    } finally {
      setBusyCarId(null);
    }
  }

  const activeRegistrations = registrations.filter((r) => r.registrationStatus !== "scratched");
  const scratchedRegistrations = registrations.filter((r) => r.registrationStatus === "scratched");

  async function startHeats() {
    if (!window.confirm("Complete registration and generate heats? No more racers can be added after this.")) return;
    setStartingHeats(true);
    setMessage("");
    try {
      const response = await fetch(`/api/events/${eventId}/start-heats`, { method: "POST" });
      const data = (await response.json()) as ActionResponse;
      if (!response.ok) {
        setMessage(data.error ?? "Failed to start heats.");
        setMessageType("error");
        return;
      }
      router.push(`/events/${eventId}/race`);
    } catch {
      setMessage("Unable to reach server.");
      setMessageType("error");
    } finally {
      setStartingHeats(false);
    }
  }

  return (
    <div className="space-y-8">
      <form onSubmit={handleSubmit} className="space-y-5">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          Register a Racer
        </h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="firstName" className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              First Name <span className="text-red-500">*</span>
            </label>
            <input id="firstName" value={firstName} onChange={(e) => setFirstName(e.target.value)} required className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none ring-zinc-300 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100" />
          </div>
          <div>
            <label htmlFor="lastName" className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Last Name
            </label>
            <input id="lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none ring-zinc-300 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100" />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="age" className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Age
            </label>
            <input id="age" type="number" min={1} max={99} value={age} onChange={(e) => setAge(e.target.value)} className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none ring-zinc-300 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100" />
          </div>
          <div>
            <label htmlFor="divisionId" className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Division <span className="text-red-500">*</span>
            </label>
            <select id="divisionId" value={divisionId} onChange={(e) => setDivisionId(e.target.value)} required className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none ring-zinc-300 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100">
              {divisions.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="carName" className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Car Name <span className="text-red-500">*</span>
          </label>
          <input id="carName" value={carName} onChange={(e) => setCarName(e.target.value)} required placeholder="e.g. Lightning Bolt" className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none ring-zinc-300 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100" />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Amount Owed
            </label>
            <div className="flex gap-2">
              {[10, 5, 0].map((amt) => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => setPaymentAmount(amt)}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition ${
                    paymentAmount === amt
                      ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                      : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  }`}
                >
                  {amt === 0 ? "Free" : `$${amt}`}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Payment Status
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPaymentStatus("paid")}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition ${
                  paymentStatus === "paid"
                    ? "border-emerald-600 bg-emerald-600 text-white dark:border-emerald-500 dark:bg-emerald-600"
                    : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                }`}
              >
                Paid
              </button>
              <button
                type="button"
                onClick={() => setPaymentStatus("pay_later")}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition ${
                  paymentStatus === "pay_later"
                    ? "border-amber-600 bg-amber-600 text-white dark:border-amber-500 dark:bg-amber-600"
                    : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                }`}
              >
                Pay Later
              </button>
            </div>
          </div>
        </div>

        <button type="submit" disabled={submitting} className="w-full rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-70 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300">
          {submitting ? "Registering..." : "Register Racer"}
        </button>

        {message && (
          <p className={`rounded-md px-3 py-2 text-sm ${messageType === "error" ? "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300" : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"}`}>
            {message}
          </p>
        )}
      </form>

      {/* Active registrations */}
      <div>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Registered Racers
          </h2>
          <span className="rounded-full bg-zinc-200 px-2.5 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
            {activeRegistrations.length}
          </span>
        </div>

        <div className="mt-3 space-y-2">
          {loadingRegistrations ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading registrations...</p>
          ) : activeRegistrations.length === 0 ? (
            <p className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
              No racers registered yet. Use the form above to add the first one.
            </p>
          ) : (
            <div className="space-y-2">
              {activeRegistrations.map((reg) => {
                const isInspecting = inspectingCarId === reg.carId;
                const isBusy = busyCarId === reg.carId;

                return (
                  <div key={reg.carId}>
                    <div className={`flex items-center gap-3 rounded-xl border px-4 py-3 transition ${isInspecting ? "border-blue-300 bg-blue-50 dark:border-blue-800 dark:bg-blue-950" : "border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900"}`}>
                      <span className="w-8 shrink-0 text-center text-sm font-bold tabular-nums text-zinc-500 dark:text-zinc-400">
                        {reg.carNumber}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                          {reg.displayName}
                        </p>
                        <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                          {reg.carName} &middot; {reg.divisionName}
                          {reg.age != null ? ` · Age ${reg.age}` : ""}
                        </p>
                      </div>

                      <PaymentBadge amount={reg.paymentAmount} status={reg.paymentStatus} />
                      <InspectionBadge status={reg.inspectionStatus} progress={reg.inspectionProgress} />

                      <div className="flex shrink-0 gap-1">
                        <button
                          type="button"
                          onClick={() => setInspectingCarId(isInspecting ? null : reg.carId)}
                          className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                        >
                          {isInspecting ? "Close" : "Inspect"}
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void scratchCar(reg.carId)}
                          className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
                        >
                          Scratch
                        </button>
                      </div>
                    </div>

                    {isInspecting && (
                      <div className="mt-2">
                        <InspectionPanel
                          eventId={eventId}
                          carId={reg.carId}
                          onClose={() => setInspectingCarId(null)}
                          onSaved={() => void loadRegistrations()}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Scratched registrations */}
      {scratchedRegistrations.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowScratched(!showScratched)}
            className="flex items-center gap-2 text-sm font-medium text-zinc-500 transition hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            <span className={`inline-block transition-transform ${showScratched ? "rotate-90" : ""}`}>
              &#9654;
            </span>
            Scratched ({scratchedRegistrations.length})
          </button>

          {showScratched && (
            <div className="mt-3 space-y-2">
              {scratchedRegistrations.map((reg) => {
                const isBusy = busyCarId === reg.carId;

                return (
                  <div
                    key={reg.carId}
                    className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50/50 px-4 py-3 opacity-75 dark:border-red-900 dark:bg-red-950/30"
                  >
                    <span className="w-8 shrink-0 text-center text-sm font-bold tabular-nums text-zinc-400 line-through dark:text-zinc-500">
                      {reg.carNumber}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-zinc-500 line-through dark:text-zinc-400">
                        {reg.displayName}
                      </p>
                      <p className="truncate text-xs text-zinc-400 dark:text-zinc-500">
                        {reg.carName} &middot; {reg.divisionName}
                      </p>
                    </div>

                    <StatusBadge status={reg.registrationStatus} />

                    <div className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void unScratchCar(reg.carId)}
                        className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-600 transition hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
                      >
                        Restore
                      </button>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void deleteCar(reg.carId)}
                        className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Complete Registration */}
      {activeRegistrations.length >= 2 && (
        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5 dark:border-blue-800 dark:bg-blue-950">
          <h2 className="text-lg font-semibold text-blue-900 dark:text-blue-100">
            Ready to Race?
          </h2>
          <p className="mt-1 text-sm text-blue-700 dark:text-blue-300">
            This will close registration, randomly assign {activeRegistrations.length} cars to heats,
            and start the qualifying rounds. Each car will race once per lane.
          </p>
          <button
            type="button"
            disabled={startingHeats}
            onClick={() => void startHeats()}
            className="mt-3 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {startingHeats ? "Generating Heats..." : "Complete Registration & Start Racing"}
          </button>
        </div>
      )}
    </div>
  );
}
