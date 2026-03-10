"use client";

import { useCallback, useEffect, useState } from "react";

type PassFail = "pass" | "fail" | "n/a" | null;

type CarResponse = {
  car?: {
    carId: string;
    carNumber: number;
    carName: string;
    displayName: string;
    registrationStatus: string;
  };
  inspection?: {
    id: string;
    overallStatus: string;
    weightOz: number | null;
    lengthIn: number | null;
    widthIn: number | null;
    heightIn: number | null;
    groundClearanceIn: number | null;
    bodyMaterialStatus: PassFail;
    wheelsStatus: PassFail;
    axlesStatus: PassFail;
    lubricantsStatus: PassFail;
    inspectorName: string | null;
    inspectorNotes: string | null;
  } | null;
  error?: string;
};

const INPUT_CLASS =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none ring-zinc-300 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";

const INPUT_ERROR_CLASS =
  "w-full rounded-lg border border-red-400 bg-white px-3 py-2 text-zinc-900 outline-none ring-red-300 focus:ring-2 dark:border-red-600 dark:bg-zinc-900 dark:text-zinc-100";

const LIMITS = {
  weightOz: { max: 5, label: "Max 5 oz" },
  lengthIn: { max: 7, label: "Max 7 in" },
  widthIn: { max: 2.75, label: "Max 2.75 in" },
  heightIn: { max: 6, label: "Max 6 in" },
  groundClearanceIn: { min: 0.375, label: "Min 3/8 in" },
} as const;

function exceedsMax(value: string, max: number): boolean {
  if (!value) return false;
  return Number(value) > max;
}

function belowMin(value: string, min: number): boolean {
  if (!value) return false;
  return Number(value) < min;
}

function MeasurementViolation({ text }: { text: string }) {
  return (
    <p className="mt-1 text-xs font-medium text-red-600 dark:text-red-400">{text}</p>
  );
}

function PassFailToggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: PassFail;
  onChange: (v: PassFail) => void;
}) {
  const options: { v: PassFail; text: string }[] = [
    { v: "pass", text: "Pass" },
    { v: "fail", text: "Fail" },
    { v: "n/a", text: "N/A" },
  ];

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5 dark:border-zinc-800 dark:bg-zinc-900">
      <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
        {label}
      </span>
      <div className="flex gap-1">
        {options.map((opt) => {
          const active = value === opt.v;
          let activeClass = "";
          if (active && opt.v === "pass")
            activeClass = "bg-emerald-600 text-white dark:bg-emerald-500";
          else if (active && opt.v === "fail")
            activeClass = "bg-red-600 text-white dark:bg-red-500";
          else if (active && opt.v === "n/a")
            activeClass = "bg-zinc-500 text-white dark:bg-zinc-400";

          return (
            <button
              key={opt.v}
              type="button"
              onClick={() => onChange(active ? null : opt.v)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                active
                  ? activeClass
                  : "bg-white text-zinc-500 hover:bg-zinc-100 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
              }`}
            >
              {opt.text}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function InspectionPanel({
  eventId,
  carId,
  onClose,
  onSaved,
}: {
  eventId: string;
  carId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const apiBase = `/api/events/${eventId}/cars/${carId}`;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error">("success");

  const [displayName, setDisplayName] = useState("");
  const [carNumber, setCarNumber] = useState(0);
  const [carName, setCarName] = useState("");
  const [overallStatus, setOverallStatus] = useState("pending");

  const [weightOz, setWeightOz] = useState("");
  const [lengthIn, setLengthIn] = useState("");
  const [widthIn, setWidthIn] = useState("");
  const [heightIn, setHeightIn] = useState("");
  const [groundClearanceIn, setGroundClearanceIn] = useState("");

  const [bodyMaterialStatus, setBodyMaterialStatus] = useState<PassFail>(null);
  const [wheelsStatus, setWheelsStatus] = useState<PassFail>(null);
  const [axlesStatus, setAxlesStatus] = useState<PassFail>(null);
  const [lubricantsStatus, setLubricantsStatus] = useState<PassFail>(null);

  const [inspectorName, setInspectorName] = useState("");
  const [inspectorNotes, setInspectorNotes] = useState("");

  const loadInspection = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(apiBase);
      const data = (await response.json()) as CarResponse;
      if (!response.ok || !data.car) {
        setMessage(data.error ?? "Failed to load inspection.");
        setMessageType("error");
        return;
      }

      setDisplayName(data.car.displayName);
      setCarNumber(data.car.carNumber);
      setCarName(data.car.carName);

      const ins = data.inspection;
      if (ins) {
        setOverallStatus(ins.overallStatus);
        setWeightOz(ins.weightOz != null ? String(ins.weightOz) : "");
        setLengthIn(ins.lengthIn != null ? String(ins.lengthIn) : "");
        setWidthIn(ins.widthIn != null ? String(ins.widthIn) : "");
        setHeightIn(ins.heightIn != null ? String(ins.heightIn) : "");
        setGroundClearanceIn(ins.groundClearanceIn != null ? String(ins.groundClearanceIn) : "");
        setBodyMaterialStatus(ins.bodyMaterialStatus);
        setWheelsStatus(ins.wheelsStatus);
        setAxlesStatus(ins.axlesStatus);
        setLubricantsStatus(ins.lubricantsStatus);
        setInspectorName(ins.inspectorName ?? "");
        setInspectorNotes(ins.inspectorNotes ?? "");
      }
    } catch {
      setMessage("Unable to load inspection.");
      setMessageType("error");
    } finally {
      setLoading(false);
    }
  }, [apiBase]);

  useEffect(() => {
    void loadInspection();
  }, [loadInspection]);

  async function save(newOverallStatus?: string) {
    setSaving(true);
    setMessage("");

    const payload: Record<string, unknown> = {
      weightOz: weightOz ? Number(weightOz) : null,
      lengthIn: lengthIn ? Number(lengthIn) : null,
      widthIn: widthIn ? Number(widthIn) : null,
      heightIn: heightIn ? Number(heightIn) : null,
      groundClearanceIn: groundClearanceIn ? Number(groundClearanceIn) : null,
      bodyMaterialStatus,
      wheelsStatus,
      axlesStatus,
      lubricantsStatus,
      inspectorName: inspectorName || null,
      inspectorNotes: inspectorNotes || null,
    };

    if (newOverallStatus) {
      payload.overallStatus = newOverallStatus;
    }

    try {
      const response = await fetch(apiBase, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = (await response.json()) as { message?: string; error?: string };

      if (!response.ok) {
        setMessage(data.error ?? "Failed to save.");
        setMessageType("error");
        return;
      }

      if (newOverallStatus) setOverallStatus(newOverallStatus);

      setMessage(newOverallStatus === "approved" ? "Inspection approved." : "Progress saved.");
      setMessageType("success");
      onSaved();
    } catch {
      setMessage("Unable to reach server.");
      setMessageType("error");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading inspection...</p>
      </div>
    );
  }

  const allChecksFilled =
    bodyMaterialStatus !== null &&
    wheelsStatus !== null &&
    axlesStatus !== null &&
    lubricantsStatus !== null &&
    weightOz !== "" &&
    lengthIn !== "" &&
    widthIn !== "" &&
    heightIn !== "" &&
    groundClearanceIn !== "";

  const hasAnyFailure =
    bodyMaterialStatus === "fail" ||
    wheelsStatus === "fail" ||
    axlesStatus === "fail" ||
    lubricantsStatus === "fail";

  const weightOver = exceedsMax(weightOz, LIMITS.weightOz.max);
  const lengthOver = exceedsMax(lengthIn, LIMITS.lengthIn.max);
  const widthOver = exceedsMax(widthIn, LIMITS.widthIn.max);
  const heightOver = exceedsMax(heightIn, LIMITS.heightIn.max);
  const clearanceUnder = belowMin(groundClearanceIn, LIMITS.groundClearanceIn.min);

  const hasMeasurementViolation = weightOver || lengthOver || widthOver || heightOver || clearanceUnder;
  const canApprove = allChecksFilled && !hasAnyFailure && !hasMeasurementViolation && overallStatus !== "approved";
  const shouldRequestChanges = hasAnyFailure || hasMeasurementViolation;

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Inspection — Car #{carNumber}
          </h3>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {displayName} &middot; {carName} &middot;{" "}
            <span className="capitalize">{overallStatus.replace("_", " ")}</span>
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm text-zinc-600 transition hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-900"
        >
          Close
        </button>
      </div>

      <div className="mt-5 space-y-5">
        <div>
          <h4 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Measurements
          </h4>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor={`weight-${carId}`} className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Weight (oz) <span className="font-normal text-zinc-400">{LIMITS.weightOz.label}</span>
              </label>
              <input id={`weight-${carId}`} type="number" step="0.01" min="0" value={weightOz} onChange={(e) => setWeightOz(e.target.value)} placeholder="e.g. 5.00" className={weightOver ? INPUT_ERROR_CLASS : INPUT_CLASS} />
              {weightOver && <MeasurementViolation text={`Exceeds ${LIMITS.weightOz.max} oz maximum`} />}
            </div>
            <div>
              <label htmlFor={`length-${carId}`} className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Length (in) <span className="font-normal text-zinc-400">{LIMITS.lengthIn.label}</span>
              </label>
              <input id={`length-${carId}`} type="number" step="0.01" min="0" value={lengthIn} onChange={(e) => setLengthIn(e.target.value)} placeholder="e.g. 7.00" className={lengthOver ? INPUT_ERROR_CLASS : INPUT_CLASS} />
              {lengthOver && <MeasurementViolation text={`Exceeds ${LIMITS.lengthIn.max} in maximum`} />}
            </div>
            <div>
              <label htmlFor={`width-${carId}`} className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Width (in) <span className="font-normal text-zinc-400">{LIMITS.widthIn.label}</span>
              </label>
              <input id={`width-${carId}`} type="number" step="0.01" min="0" value={widthIn} onChange={(e) => setWidthIn(e.target.value)} placeholder="e.g. 2.75" className={widthOver ? INPUT_ERROR_CLASS : INPUT_CLASS} />
              {widthOver && <MeasurementViolation text={`Exceeds ${LIMITS.widthIn.max} in maximum`} />}
            </div>
            <div>
              <label htmlFor={`height-${carId}`} className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Height (in) <span className="font-normal text-zinc-400">{LIMITS.heightIn.label}</span>
              </label>
              <input id={`height-${carId}`} type="number" step="0.01" min="0" value={heightIn} onChange={(e) => setHeightIn(e.target.value)} placeholder="e.g. 3.00" className={heightOver ? INPUT_ERROR_CLASS : INPUT_CLASS} />
              {heightOver && <MeasurementViolation text={`Exceeds ${LIMITS.heightIn.max} in maximum`} />}
            </div>
            <div className="sm:col-span-2">
              <label htmlFor={`clearance-${carId}`} className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Ground Clearance (in) <span className="font-normal text-zinc-400">{LIMITS.groundClearanceIn.label}</span>
              </label>
              <input id={`clearance-${carId}`} type="number" step="0.01" min="0" value={groundClearanceIn} onChange={(e) => setGroundClearanceIn(e.target.value)} placeholder="e.g. 0.375" className={clearanceUnder ? INPUT_ERROR_CLASS : INPUT_CLASS} />
              {clearanceUnder && <MeasurementViolation text={`Below ${LIMITS.groundClearanceIn.min} in minimum`} />}
            </div>
          </div>
        </div>

        <div>
          <h4 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Component Checks
          </h4>
          <div className="space-y-2">
            <PassFailToggle label="Body Material" value={bodyMaterialStatus} onChange={setBodyMaterialStatus} />
            <PassFailToggle label="Wheels" value={wheelsStatus} onChange={setWheelsStatus} />
            <PassFailToggle label="Axles" value={axlesStatus} onChange={setAxlesStatus} />
            <PassFailToggle label="Lubricants" value={lubricantsStatus} onChange={setLubricantsStatus} />
          </div>
        </div>

        <div>
          <h4 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Inspector
          </h4>
          <div className="space-y-3">
            <div>
              <label htmlFor={`inspector-${carId}`} className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Inspector Name
              </label>
              <input id={`inspector-${carId}`} value={inspectorName} onChange={(e) => setInspectorName(e.target.value)} className={INPUT_CLASS} />
            </div>
            <div>
              <label htmlFor={`notes-${carId}`} className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Notes
              </label>
              <textarea id={`notes-${carId}`} value={inspectorNotes} onChange={(e) => setInspectorNotes(e.target.value)} rows={2} className={INPUT_CLASS} />
            </div>
          </div>
        </div>

        {message && (
          <p className={`rounded-md px-3 py-2 text-sm ${messageType === "error" ? "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300" : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"}`}>
            {message}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={saving} onClick={() => void save()} className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900">
            {saving ? "Saving..." : "Save Progress"}
          </button>

          {canApprove && (
            <button type="button" disabled={saving} onClick={() => void save("approved")} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-60">
              Approve
            </button>
          )}

          {shouldRequestChanges && overallStatus !== "changes_requested" && (
            <button type="button" disabled={saving} onClick={() => void save("changes_requested")} className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-amber-500 disabled:opacity-60">
              Request Changes
            </button>
          )}

          {hasMeasurementViolation && (
            <p className="w-full text-xs text-red-600 dark:text-red-400">
              One or more measurements are out of spec. The car cannot be approved until all measurements are within limits.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
