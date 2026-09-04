"use client";

import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import { bodyfatDomain } from "@/lib/bodyfat";
import type { CompositionPoint } from "@/lib/stats";

const COBALT = "#4E86E8";
const EDGE = "#243050";
const MUTED = "#5C6478";

/**
 * Body fat over time, zoomed to the range actually lived in.
 *
 * This used to be lean and fat mass stacked from zero, on the reasoning that
 * "which tissue is leaving" is a question about proportion and proportion has to
 * be read against the whole body. The reasoning was sound and the chart was
 * useless: stacked to a hundred-kilo total, an axis rounded up to 110, a year of
 * work is a band a few pixels thick and a good month is invisible. Worse, the
 * numbers on the axis looked like percentages and ran past 100.
 *
 * The proportion question is answered exactly, in numbers, in the three cells
 * directly beneath this chart — fat delta, lean delta, and what share of the
 * change was fat. So the chart is free to answer the other question, the one
 * numbers answer badly: which way is this going, and how steadily.
 *
 * The axis window is `bodyfatDomain` in lib/bodyfat, where the reasoning for the
 * truncation and the floor on the zoom live with the arithmetic that can be
 * checked. Here it is enough to know the raw daily readings are drawn behind the
 * average for the same reason: a zoomed axis with no visible scatter invites you
 * to read hydration as biology.
 *
 * There is no target line. The plan document sets no body-fat goal, and a number
 * invented for the sake of a nice-looking chart would be worse than none. The
 * reference is your own first reading instead, which is real and is the only
 * comparison that matters.
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
            : "One reading. A direction needs a few days before it means anything."}
        </p>
      </div>
    );
  }

  const { min, max, ticks } = bodyfatDomain(points);

  const start = points[0].bodyfatPct;
  const latest = points[points.length - 1].bodyfatPct;
  const move = Math.round((latest - start) * 10) / 10;

  return (
    // The fixed height belongs to the chart alone — putting it on a wrapper that
    // also holds the legend pushes the legend out through the panel border.
    <div className="w-full">
      <div style={{ width: "100%", height }}>
        <ResponsiveContainer>
          {/* Less negative than the weight chart's margin: these ticks carry a
              "%" suffix and get clipped to nonsense ("30%" → "0%") without it. */}
          <ComposedChart data={points} margin={{ top: 8, right: 10, bottom: 4, left: -6 }}>
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
              domain={[min, max]}
              ticks={ticks}
              tick={{ fill: MUTED, fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              width={40}
              allowDecimals={false}
              tickFormatter={(v: number) => `${v}%`}
            />

            {/* Where you started. However far the axis zooms, the gap between the
                line and this is the honest answer to "has any of it worked".
                Named in the legend rather than on the plot: the line begins at
                this exact value, so any label sits on top of the data. */}
            <ReferenceLine y={start} stroke={MUTED} strokeWidth={1} strokeDasharray="3 5" />

            {/* Raw readings — faint, deliberately secondary, and the reason the
                zoomed axis can be trusted. */}
            <Line
              dataKey="rawPct"
              stroke="transparent"
              dot={{ r: 1.8, fill: MUTED, stroke: "none" }}
              activeDot={false}
              isAnimationActive={false}
              connectNulls={false}
            />

            {/* The signal. */}
            <Line
              dataKey="bodyfatPct"
              stroke={COBALT}
              strokeWidth={2.6}
              strokeLinecap="round"
              strokeLinejoin="round"
              dot={false}
              activeDot={false}
              isAnimationActive={false}
              connectNulls
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
        <Legend color={COBALT} text="Body fat · 7-day average" mark="line" />
        <Legend color={MUTED} text="Daily reading" mark="dot" />
        {/* The reference line and what it is worth, in one entry — the delta is
            the only reason the line is drawn. */}
        <Legend
          color={MUTED}
          mark="dash"
          text={`Start ${start.toFixed(1)}%${move === 0 ? " · level" : ` · ${move > 0 ? "+" : ""}${move} since`}`}
        />
      </div>
    </div>
  );
}

function Legend({ color, text, mark }: { color: string; text: string; mark: "line" | "dot" | "dash" }) {
  return (
    <span className="flex items-center gap-1.5">
      {mark === "line" ? (
        <span className="h-0.5 w-4" style={{ background: color }} />
      ) : mark === "dash" ? (
        <span
          className="h-0.5 w-4"
          style={{ backgroundImage: `linear-gradient(to right, ${color} 0 3px, transparent 3px 8px)`, backgroundSize: "8px 100%" }}
        />
      ) : (
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      )}
      <span className="label-xs">{text}</span>
    </span>
  );
}
