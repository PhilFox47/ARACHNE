"use client";

import { useCallback, useRef, useState } from "react";
import { PHOTO_ANGLES } from "@/lib/plan";

export interface WeekSet {
  weekIndex: number;
  label: string;
  byAngle: Record<string, string | undefined>;
}

/**
 * Two weeks, one on top of the other, with a draggable divider.
 *
 * A side-by-side pair at phone width gives you two 180px images and tells you
 * nothing. Overlaying them at full width and wiping between is the only
 * treatment where a few centimetres off a waist is actually visible.
 */
export function SuitCompare({ weeks }: { weeks: WeekSet[] }) {
  const [angle, setAngle] = useState<string>(PHOTO_ANGLES[0].key);
  const [aIdx, setAIdx] = useState(weeks.length - 1);
  const [bIdx, setBIdx] = useState(0);
  const [pos, setPos] = useState(50);
  const frameRef = useRef<HTMLDivElement>(null);

  const a = weeks[aIdx];
  const b = weeks[bIdx];
  const aSrc = a?.byAngle[angle];
  const bSrc = b?.byAngle[angle];

  const move = useCallback((clientX: number) => {
    const el = frameRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const p = ((clientX - rect.left) / rect.width) * 100;
    setPos(Math.max(0, Math.min(100, p)));
  }, []);

  return (
    <div className="flex flex-col gap-4">
      {/* ── Angle ── */}
      <div className="grid grid-cols-4 gap-2">
        {PHOTO_ANGLES.map((x) => (
          <button
            key={x.key}
            type="button"
            onClick={() => setAngle(x.key)}
            className={`tap flex items-center justify-center border px-1 py-2 text-[0.6rem] uppercase tracking-widest ${
              angle === x.key ? "border-crimson bg-crimson/15 text-crimson" : "border-edge text-muted"
            }`}
          >
            {x.label}
          </button>
        ))}
      </div>

      {/* ── The wipe ── */}
      <div
        ref={frameRef}
        className="relative aspect-[3/4] w-full select-none overflow-hidden border border-edge bg-panel-2"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          move(e.clientX);
        }}
        onPointerMove={(e) => {
          if (e.buttons > 0 || e.pointerType === "touch") move(e.clientX);
        }}
        role="slider"
        aria-label="Comparison position"
        aria-valuenow={Math.round(pos)}
        aria-valuemin={0}
        aria-valuemax={100}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") setPos((p) => Math.max(0, p - 4));
          if (e.key === "ArrowRight") setPos((p) => Math.min(100, p + 4));
        }}
      >
        {aSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/photo/${aSrc}`} alt="" draggable={false} className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="label-xs">No {angle.replace("_", " ")} shot in week {(a?.weekIndex ?? 0) + 1}</span>
          </span>
        )}

        {bSrc ? (
          // clip-path rather than a narrowing container: the element stays full
          // width, so both sides are always the identical crop. Sizing the
          // wrapper instead would squash this image as the divider moved, and
          // would depend on a measured width that is null on first paint.
          <div
            className="absolute inset-0"
            style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/photo/${bSrc}`} alt="" draggable={false} className="h-full w-full object-cover" />
          </div>
        ) : null}

        {/* Divider, drawn as a tensioned line with a grab node. */}
        <div className="pointer-events-none absolute inset-y-0" style={{ left: `${pos}%` }}>
          <div className="absolute inset-y-0 -left-px w-0.5 bg-crimson" />
          <div className="absolute top-1/2 -left-4 flex h-8 w-8 -translate-y-1/2 items-center justify-center border border-crimson bg-base text-crimson">
            ↔
          </div>
        </div>

        <span className="pointer-events-none absolute left-2 top-2 bg-base/80 px-2 py-1 text-[0.6rem] uppercase tracking-widest text-cobalt-lift">
          {b?.label}
        </span>
        <span className="pointer-events-none absolute right-2 top-2 bg-base/80 px-2 py-1 text-[0.6rem] uppercase tracking-widest text-ink">
          {a?.label}
        </span>
      </div>

      {/* ── Which two ── */}
      <div className="grid grid-cols-2 gap-3">
        <Picker label="Left" value={bIdx} onChange={setBIdx} weeks={weeks} accent="cobalt" />
        <Picker label="Right" value={aIdx} onChange={setAIdx} weeks={weeks} accent="crimson" />
      </div>
    </div>
  );
}

function Picker({
  label,
  value,
  onChange,
  weeks,
  accent,
}: {
  label: string;
  value: number;
  onChange: (i: number) => void;
  weeks: WeekSet[];
  accent: "cobalt" | "crimson";
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className={`label-xs ${accent === "cobalt" ? "text-cobalt-lift" : "text-crimson"}`}>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="tap border border-edge bg-panel-2 px-3 text-sm text-ink outline-none focus:border-cobalt"
      >
        {weeks.map((w, i) => (
          <option key={w.weekIndex} value={i}>
            {w.label}
          </option>
        ))}
      </select>
    </label>
  );
}
