"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addWater, undoWater } from "@/app/fuel/water";
import { WATER_INCREMENTS_ML } from "@/lib/plan";

/**
 * Increments rather than a total field. Typing "1750" is arithmetic; tapping
 * a glass is a record of an event, and it's what you'll actually do at the tap.
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
  const [, start] = useTransition();

  const pct = targetMl > 0 ? Math.min(100, Math.round((ml / targetMl) * 100)) : 0;
  const met = ml >= targetMl;

  const add = (amount: number) => {
    setMl((v) => v + amount);
    if (navigator.vibrate) navigator.vibrate(6);
    start(async () => {
      await addWater(amount, date);
      router.refresh();
    });
  };

  const undo = () => {
    start(async () => {
      const res = await undoWater(date);
      if (res.ok) setMl((v) => Math.max(0, v - (res.removed ?? 0)));
      router.refresh();
    });
  };

  // Ten segments, each one tenth of the target. Reads at a glance without
  // needing the number.
  const segments = Array.from({ length: 10 }, (_, i) => (i + 1) * (targetMl / 10) <= ml);

  return (
    <div className={`panel flex flex-col gap-3 ${compact ? "p-3" : "p-4"}`}>
      <div className="flex items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <p className="label-xs">Water</p>
          <p className={`numeral tabular ${compact ? "text-2xl" : "text-4xl"} ${met ? "text-cobalt-lift" : "text-ink"}`}>
            {(ml / 1000).toFixed(2).replace(/\.?0+$/, "")}
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

      <div className="flex gap-1" aria-hidden="true">
        {segments.map((filled, i) => (
          <span
            key={i}
            className={`h-2 flex-1 border ${
              filled ? "border-cobalt bg-cobalt" : "border-edge bg-panel-2"
            }`}
          />
        ))}
      </div>

      <div className="flex gap-2">
        {WATER_INCREMENTS_ML.map((inc) => (
          <button
            key={inc}
            type="button"
            onClick={() => add(inc)}
            className="tap display flex-1 border border-edge py-2 text-xs tracking-widest text-muted active:border-cobalt active:text-cobalt-lift"
          >
            +{inc}
          </button>
        ))}
      </div>

      <p className="label-xs" aria-live="polite">
        {met ? "Target met." : `${((targetMl - ml) / 1000).toFixed(2).replace(/\.?0+$/, "")} L to go`}
      </p>
    </div>
  );
}
