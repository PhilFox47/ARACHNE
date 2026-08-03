"use client";

import { useState, useTransition } from "react";
import { logWeight } from "@/app/actions";

/**
 * VITALS entry. Two taps from open to saved: the field is pre-filled with your
 * last reading, so the usual interaction is one nudge and LOG.
 *
 * Deliberately no confirmation dialog and no success screen — the number
 * updating in place is the confirmation.
 */
export function WeightEntry({
  initial,
  loggedToday,
  today,
}: {
  initial: number | null;
  loggedToday: boolean;
  today: string;
}) {
  const [value, setValue] = useState(initial !== null ? initial.toFixed(1) : "");
  const [saved, setSaved] = useState(loggedToday);
  const [error, setError] = useState<string | null>(null);
  const [snap, setSnap] = useState(false);
  const [pending, start] = useTransition();

  const nudge = (delta: number) => {
    const base = Number(value);
    const next = (Number.isFinite(base) && value !== "" ? base : (initial ?? 80)) + delta;
    setValue(next.toFixed(1));
    setSaved(false);
    if (navigator.vibrate) navigator.vibrate(6);
  };

  const submit = () => {
    const kg = Number(value);
    if (!Number.isFinite(kg) || value === "") {
      setError("Enter a weight first.");
      return;
    }
    setError(null);
    start(async () => {
      const res = await logWeight(kg, today);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSaved(true);
      setSnap(true);
      setTimeout(() => setSnap(false), 320);
      if (navigator.vibrate) navigator.vibrate([12, 40, 18]);
    });
  };

  return (
    <div className="panel flex flex-col gap-4 p-4">
      <div className="flex items-baseline justify-between">
        <p className="label-xs">Today&apos;s reading</p>
        {saved ? (
          <p className="label-xs text-cobalt-lift">Logged</p>
        ) : (
          <p className="label-xs text-crimson">Not logged</p>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => nudge(-0.1)}
          aria-label="Decrease by 0.1 kg"
          className="tap panel flex items-center justify-center px-4 text-2xl text-muted active:border-crimson active:text-crimson"
        >
          &minus;
        </button>

        <div className="flex flex-1 items-baseline justify-center gap-1">
          <input
            inputMode="decimal"
            type="number"
            step="0.1"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setSaved(false);
            }}
            placeholder="—"
            aria-label="Weight in kilograms"
            className="numeral w-full min-w-0 bg-transparent text-center text-5xl text-ink outline-none placeholder:text-muted-dim"
            style={snap ? { animation: "snap-scale 320ms cubic-bezier(.34,1.4,.5,1)" } : undefined}
          />
          <span className="label-xs shrink-0">kg</span>
        </div>

        <button
          type="button"
          onClick={() => nudge(0.1)}
          aria-label="Increase by 0.1 kg"
          className="tap panel flex items-center justify-center px-4 text-2xl text-muted active:border-crimson active:text-crimson"
        >
          +
        </button>
      </div>

      {error ? <p className="text-xs text-crimson">{error}</p> : null}

      <button
        type="button"
        onClick={submit}
        disabled={pending}
        className="tap display w-full border border-crimson bg-crimson px-4 py-3 text-sm tracking-widest text-ink transition-opacity active:opacity-70 disabled:opacity-50"
      >
        {pending ? "Logging" : saved ? "Update" : "Log"}
      </button>
    </div>
  );
}
