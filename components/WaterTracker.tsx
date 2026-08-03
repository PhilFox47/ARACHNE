"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addWater, undoWater } from "@/app/fuel/water";
import { WATER_CUSTOM_MAX_ML, WATER_INCREMENTS_ML } from "@/lib/plan";

const fmtL = (ml: number) => (ml / 1000).toFixed(2).replace(/\.?0+$/, "");

/**
 * One bar, filled proportionally. Segments implied that a glass was a unit of
 * measurement — it isn't, and once the custom amount exists a tenth of the
 * target stops lining up with anything you actually drank.
 *
 * Increments rather than a running total: tapping a bottle records an event,
 * whereas typing "1750" is arithmetic you have to do yourself.
 */
export function WaterTracker({
  initialMl,
  targetMl,
  date,
  compact,
}: {
  initialMl: number;
  targetMl: number;
  date: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const [ml, setMl] = useState(initialMl);
  const [custom, setCustom] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();
  const customRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (custom !== null) customRef.current?.focus();
  }, [custom]);

  const pct = targetMl > 0 ? Math.min(100, (ml / targetMl) * 100) : 0;
  const met = ml >= targetMl;

  const add = (amount: number) => {
    setError(null);
    setMl((v) => v + amount);
    if (navigator.vibrate) navigator.vibrate(6);
    start(async () => {
      const res = await addWater(amount, date);
      // The optimistic number has to come back off if the server refused it.
      if (!res.ok) {
        setMl((v) => Math.max(0, v - amount));
        setError(res.error);
      }
      router.refresh();
    });
  };

  const submitCustom = () => {
    const n = Math.round(Number((custom ?? "").replace(",", ".")));
    if (!Number.isFinite(n) || n <= 0 || n > WATER_CUSTOM_MAX_ML) {
      setError(`Enter between 1 and ${WATER_CUSTOM_MAX_ML} ml.`);
      return;
    }
    setCustom(null);
    add(n);
  };

  const undo = () => {
    start(async () => {
      const res = await undoWater(date);
      if (res.ok) setMl((v) => Math.max(0, v - (res.removed ?? 0)));
      router.refresh();
    });
  };

  return (
    <div className={`panel flex flex-col gap-3 ${compact ? "p-3" : "p-4"}`}>
      <div className="flex items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <p className="label-xs">Water</p>
          <p
            className={`numeral tabular ${compact ? "text-2xl" : "text-4xl"} ${
              met ? "text-cobalt-lift" : "text-ink"
            }`}
          >
            {fmtL(ml)}
            <span className="ml-1 text-[0.35em] tracking-normal text-muted">
              / {(targetMl / 1000).toFixed(1)} L
            </span>
          </p>
        </div>
        {ml > 0 ? (
          <button type="button" onClick={undo} className="label-xs underline">
            Undo
          </button>
        ) : null}
      </div>

      {/* One bar. Overshoot pins at full rather than running off the end. */}
      <div
        className="h-2.5 w-full border border-edge bg-panel-2"
        role="progressbar"
        aria-valuenow={ml}
        aria-valuemin={0}
        aria-valuemax={targetMl}
        aria-label={`${fmtL(ml)} of ${(targetMl / 1000).toFixed(1)} litres`}
      >
        <div
          className={`h-full transition-[width] duration-300 ease-out ${met ? "bg-cobalt-lift" : "bg-cobalt"}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      {custom === null ? (
        <div className="grid grid-cols-4 gap-2">
          {WATER_INCREMENTS_ML.map((inc) => (
            <button
              key={inc}
              type="button"
              onClick={() => add(inc)}
              className="tap display border border-edge py-2 text-[0.65rem] tracking-widest text-muted active:border-cobalt active:text-cobalt-lift"
            >
              {inc}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              setError(null);
              setCustom("");
            }}
            className="tap display border border-edge py-2 text-[0.65rem] tracking-widest text-cobalt-lift active:border-cobalt"
          >
            CUSTOM
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <span className="flex flex-1 items-baseline gap-1 border border-cobalt bg-panel-2 px-3">
            <input
              ref={customRef}
              value={custom}
              onChange={(e) => setCustom(e.target.value.replace(/[^\d]/g, ""))}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitCustom();
                if (e.key === "Escape") setCustom(null);
              }}
              inputMode="numeric"
              placeholder="0"
              aria-label="Custom amount in millilitres"
              className="numeral tap w-full min-w-0 bg-transparent text-lg text-ink outline-none placeholder:text-muted-dim"
            />
            <span className="label-xs shrink-0">ml</span>
          </span>
          <button
            type="button"
            onClick={submitCustom}
            className="tap display border border-cobalt bg-cobalt px-4 text-xs tracking-widest text-ink"
          >
            Add
          </button>
          <button
            type="button"
            onClick={() => {
              setCustom(null);
              setError(null);
            }}
            className="tap display border border-edge px-3 text-xs tracking-widest text-muted"
          >
            ✕
          </button>
        </div>
      )}

      {error ? <p className="text-xs text-crimson">{error}</p> : null}

      <p className="label-xs" aria-live="polite">
        {met ? "Target met." : `${fmtL(targetMl - ml)} L to go`}
      </p>
    </div>
  );
}
