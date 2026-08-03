"use client";

import {
  Area,
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import type { DayNutrition, FuelStats } from "@/lib/fuelStats";

const COBALT = "#2B5CB8";
const COBALT_LIFT = "#4E86E8";
const CRIMSON = "#D42A3F";
const EDGE = "#243050";
const MUTED = "#5C6478";

const axis = {
  tick: { fill: MUTED, fontSize: 9 },
  tickLine: false,
} as const;

/**
 * Four-digit calorie labels don't fit the axis gutter at this width — they were
 * being clipped to nonsense like "772" for 2,772. Compacting to "2.5k" keeps
 * the gutter narrow without lying about the number.
 */
const kcalTick = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v));

function Frame({ children, height = 190 }: { children: React.ReactNode; height?: number }) {
  return (
    <div className="w-full">
      <div style={{ width: "100%", height }}>{children}</div>
    </div>
  );
}

function Legend({ items }: { items: { color: string; text: string; kind?: "line" | "bar" | "band" }[] }) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
      {items.map((i) => (
        <span key={i.text} className="flex items-center gap-1.5">
          {i.kind === "line" ? (
            <span className="h-0.5 w-4" style={{ background: i.color }} />
          ) : i.kind === "band" ? (
            <span className="h-2.5 w-4" style={{ background: i.color, opacity: 0.25 }} />
          ) : (
            <span className="h-2.5 w-2.5" style={{ background: i.color }} />
          )}
          <span className="label-xs">{i.text}</span>
        </span>
      ))}
    </div>
  );
}

/**
 * Daily intake as faint bars, the 7-day mean as the dominant line — the same
 * grammar as the weight corridor, because it's the same claim: individual days
 * are noise, the average is the signal.
 */
export function IntakeChart({ days }: { days: DayNutrition[] }) {
  const target = days[days.length - 1]?.kcalTarget ?? 0;
  const max = Math.max(target, ...days.map((d) => d.kcal)) * 1.1;

  return (
    <>
      <Frame>
        <ResponsiveContainer>
          <ComposedChart data={days} margin={{ top: 8, right: 8, bottom: 0, left: -6 }}>
            <CartesianGrid stroke={EDGE} strokeDasharray="2 5" vertical={false} />
            <XAxis dataKey="label" {...axis} axisLine={{ stroke: EDGE }} interval="preserveStartEnd" minTickGap={40} />
            <YAxis
              domain={[0, Math.round(max)]}
              {...axis}
              axisLine={false}
              width={34}
              tickFormatter={kcalTick}
            />

            <Bar dataKey="kcal" fill={MUTED} fillOpacity={0.45} isAnimationActive={false} />
            <ReferenceLine y={target} stroke={CRIMSON} strokeDasharray="4 4" strokeOpacity={0.8} />
            <Line
              dataKey="kcalAvg7"
              stroke={COBALT_LIFT}
              strokeWidth={2.6}
              dot={false}
              connectNulls
              isAnimationActive={false}
              strokeLinecap="round"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </Frame>
      <Legend
        items={[
          { color: COBALT_LIFT, text: "7-day average", kind: "line" },
          { color: MUTED, text: "Daily" },
          { color: CRIMSON, text: `Target ${target.toLocaleString("en-GB")}`, kind: "line" },
        ]}
      />
    </>
  );
}

/**
 * The chart the brief called the one that would change behaviour: how much of
 * each day's energy came from snacks rather than meals.
 */
export function SnackSplitChart({ days }: { days: DayNutrition[] }) {
  return (
    <>
      <Frame>
        <ResponsiveContainer>
          <ComposedChart data={days} margin={{ top: 8, right: 8, bottom: 0, left: -6 }}>
            <CartesianGrid stroke={EDGE} strokeDasharray="2 5" vertical={false} />
            <XAxis dataKey="label" {...axis} axisLine={{ stroke: EDGE }} interval="preserveStartEnd" minTickGap={40} />
            <YAxis {...axis} axisLine={false} width={34} tickFormatter={kcalTick} />
            <Bar dataKey="mealKcal" stackId="k" fill={COBALT} fillOpacity={0.75} isAnimationActive={false} />
            <Bar dataKey="snackKcal" stackId="k" fill={CRIMSON} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </Frame>
      <Legend
        items={[
          { color: COBALT, text: "Meals" },
          { color: CRIMSON, text: "Snacks" },
        ]}
      />
    </>
  );
}

export function WaterChart({ days, targetMl }: { days: DayNutrition[]; targetMl: number }) {
  const data = days.map((d) => ({ ...d, litres: Math.round((d.waterMl / 1000) * 100) / 100 }));
  return (
    <>
      <Frame height={160}>
        <ResponsiveContainer>
          <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -6 }}>
            <CartesianGrid stroke={EDGE} strokeDasharray="2 5" vertical={false} />
            <XAxis dataKey="label" {...axis} axisLine={{ stroke: EDGE }} interval="preserveStartEnd" minTickGap={40} />
            <YAxis {...axis} axisLine={false} width={38} unit="L" />
            <Area
              dataKey="litres"
              stroke={COBALT_LIFT}
              strokeWidth={2}
              fill={COBALT}
              fillOpacity={0.25}
              isAnimationActive={false}
            />
            <ReferenceLine y={targetMl / 1000} stroke={CRIMSON} strokeDasharray="4 4" strokeOpacity={0.8} />
          </ComposedChart>
        </ResponsiveContainer>
      </Frame>
      <Legend
        items={[
          { color: COBALT, text: "Litres", kind: "band" },
          { color: CRIMSON, text: `Target ${(targetMl / 1000).toFixed(1)} L`, kind: "line" },
        ]}
      />
    </>
  );
}

/** When the calories actually land. Late clusters are the thing to notice. */
export function HourChart({ hourly }: { hourly: FuelStats["hourly"] }) {
  const data = hourly.map((h) => ({
    ...h,
    label: String(h.hour).padStart(2, "0"),
    // Anything from 21:00 is flagged — that's where unplanned eating lives.
    late: h.hour >= 21 || h.hour < 5,
  }));
  const peak = data.reduce((m, h) => (h.kcal > m.kcal ? h : m), data[0]);

  return (
    <>
      <Frame height={150}>
        <ResponsiveContainer>
          <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -6 }}>
            <CartesianGrid stroke={EDGE} strokeDasharray="2 5" vertical={false} />
            <XAxis dataKey="label" {...axis} axisLine={{ stroke: EDGE }} interval={2} />
            <YAxis {...axis} axisLine={false} width={34} tickFormatter={kcalTick} />
            <Bar dataKey="kcal" isAnimationActive={false}>
              {data.map((h) => (
                <Cell key={h.hour} fill={h.late ? CRIMSON : COBALT} fillOpacity={h.late ? 1 : 0.7} />
              ))}
            </Bar>
          </ComposedChart>
        </ResponsiveContainer>
      </Frame>
      <p className="label-xs mt-2">
        {peak && peak.kcal > 0 ? `Heaviest hour: ${peak.label}:00` : "Nothing logged yet"} · late hours in crimson
      </p>
    </>
  );
}

/** Per-weekday snack load — the pattern SENSE is looking for, drawn out. */
export function WeekdayChart({ weekday }: { weekday: FuelStats["weekday"] }) {
  const data = weekday.map((w) => ({
    name: w.name,
    snack: w.days > 0 ? Math.round(w.snackKcal / w.days) : 0,
    meal: w.days > 0 ? Math.round(w.mealKcal / w.days) : 0,
  }));
  // Monday-first reads better than the JS Sunday-first ordering.
  const ordered = [...data.slice(1), data[0]];

  return (
    <>
      <Frame height={160}>
        <ResponsiveContainer>
          <ComposedChart data={ordered} margin={{ top: 8, right: 8, bottom: 0, left: -6 }}>
            <CartesianGrid stroke={EDGE} strokeDasharray="2 5" vertical={false} />
            <XAxis dataKey="name" {...axis} axisLine={{ stroke: EDGE }} />
            <YAxis {...axis} axisLine={false} width={34} tickFormatter={kcalTick} />
            <Bar dataKey="meal" stackId="w" fill={COBALT} fillOpacity={0.7} isAnimationActive={false} />
            <Bar dataKey="snack" stackId="w" fill={CRIMSON} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </Frame>
      <Legend
        items={[
          { color: COBALT, text: "Meals, daily average" },
          { color: CRIMSON, text: "Snacks, daily average" },
        ]}
      />
    </>
  );
}