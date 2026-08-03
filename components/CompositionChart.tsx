"use client";

import {
  Area,
  CartesianGrid,
  ComposedChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import type { CompositionPoint } from "@/lib/stats";

const COBALT = "#2B5CB8";
const COBALT_LIFT = "#4E86E8";
const CRIMSON = "#D42A3F";
const EDGE = "#243050";
const MUTED = "#5C6478";

/**
 * Stacked, and stacked from zero on purpose. The question this chart answers is
 * "which tissue is leaving" — and that's a question about proportion, so the
 * bands have to be read against the whole body, not against a zoomed window
 * where a 200 g wobble looks like a collapse.
 *
 * Lean sits underneath because it's the foundation: you want to watch the
 * crimson band thin while the cobalt one stays exactly where it is.
 */
export function CompositionChart({
  points,
  height = 220,
}: {
  points: CompositionPoint[];
  height?: number;
}) {
  if (points.length < 2) {
    return (
      <div className="panel halftone flex items-center justify-center px-4 text-center" style={{ height }}>
        <p className="label-xs">
          {points.length === 0
            ? "No body-fat readings yet."
            : "One reading. The split needs a few days before it means anything."}
        </p>
      </div>
    );
  }

  const max = Math.ceil(Math.max(...points.map((p) => p.fatKg + p.leanKg)) / 10) * 10;

  return (
    <div className="w-full">
      <div style={{ width: "100%", height }}>
        <ResponsiveContainer>
          <ComposedChart data={points} margin={{ top: 8, right: 10, bottom: 4, left: -18 }}>
            <CartesianGrid stroke={EDGE} strokeDasharray="2 5" vertical={false} />

            <XAxis
              dataKey="day"
              tick={{ fill: MUTED, fontSize: 10 }}
              tickLine={false}
              axisLine={{ stroke: EDGE }}
              interval="preserveStartEnd"
              minTickGap={44}
            />
            <YAxis
              domain={[0, max]}
              tick={{ fill: MUTED, fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              width={40}
              allowDecimals={false}
            />

            <Area
              dataKey="leanKg"
              stackId="body"
              stroke={COBALT_LIFT}
              strokeWidth={1.5}
              fill={COBALT}
              fillOpacity={0.35}
              isAnimationActive={false}
              activeDot={false}
              connectNulls
            />
            <Area
              dataKey="fatKg"
              stackId="body"
              stroke={CRIMSON}
              strokeWidth={1.5}
              fill={CRIMSON}
              fillOpacity={0.3}
              isAnimationActive={false}
              activeDot={false}
              connectNulls
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
        <Swatch color={CRIMSON} text="Fat mass" />
        <Swatch color={COBALT_LIFT} text="Lean mass" />
        <span className="label-xs text-muted-dim">7-day average</span>
      </div>
    </div>
  );
}

function Swatch({ color, text }: { color: string; text: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-2.5 w-4" style={{ background: color, opacity: 0.45 }} />
      <span className="label-xs">{text}</span>
    </span>
  );
}
