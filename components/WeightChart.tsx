"use client";

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import type { WeightPoint } from "@/lib/stats";
import { CORRIDOR_TOLERANCE_KG } from "@/lib/plan";

const COBALT = "#4E86E8";
const CRIMSON = "#D42A3F";
const EDGE = "#243050";
const MUTED = "#5C6478";

type Row = WeightPoint & { band: [number, number] };

/**
 * Semantic colour rule, applied literally: the average line is cobalt while it
 * sits inside the corridor and turns crimson the moment it leaves. Built as
 * gradient stops with hard transitions rather than two overlaid series, so the
 * line stays a single continuous path.
 */
function strokeStops(rows: Row[]) {
  const out: { offset: string; color: string }[] = [];
  const span = Math.max(rows.length - 1, 1);
  const isOut = (r: Row) => r.avg !== null && Math.abs(r.avg - r.target) > CORRIDOR_TOLERANCE_KG;

  let prev: boolean | null = null;
  rows.forEach((r, i) => {
    const cur = isOut(r);
    const pct = `${((i / span) * 100).toFixed(2)}%`;
    if (prev === null) {
      out.push({ offset: "0%", color: cur ? CRIMSON : COBALT });
    } else if (cur !== prev) {
      out.push({ offset: pct, color: prev ? CRIMSON : COBALT });
      out.push({ offset: pct, color: cur ? CRIMSON : COBALT });
    }
    prev = cur;
  });
  out.push({ offset: "100%", color: prev ? CRIMSON : COBALT });
  return out;
}

export function WeightChart({ points, height = 220 }: { points: WeightPoint[]; height?: number }) {
  const withData = points.filter((p) => p.raw !== null || p.avg !== null);
  if (withData.length === 0) {
    return (
      <div
        className="panel halftone flex items-center justify-center"
        style={{ height }}
      >
        <p className="label-xs">No vitals on record.</p>
      </div>
    );
  }

  const rows: Row[] = points.map((p) => ({ ...p, band: [p.lo, p.hi] }));

  const values = rows.flatMap((r) => [r.raw, r.avg, r.lo, r.hi].filter((v): v is number => v !== null));
  const min = Math.floor(Math.min(...values) - 0.6);
  const max = Math.ceil(Math.max(...values) + 0.6);

  const last = [...rows].reverse().find((r) => r.avg !== null);
  const lastOut = last && last.avg !== null && Math.abs(last.avg - last.target) > CORRIDOR_TOLERANCE_KG;
  const stops = strokeStops(rows);

  return (
    // The fixed height belongs to the chart alone — putting it on a wrapper that
    // also holds the legend pushes the legend out through the panel border.
    <div className="w-full">
      <div style={{ width: "100%", height }}>
        <ResponsiveContainer>
        <ComposedChart data={rows} margin={{ top: 8, right: 10, bottom: 4, left: -18 }}>
          <defs>
            <linearGradient id="avgStroke" x1="0" y1="0" x2="1" y2="0">
              {stops.map((s, i) => (
                <stop key={`${s.offset}-${i}`} offset={s.offset} stopColor={s.color} />
              ))}
            </linearGradient>
          </defs>

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
            tick={{ fill: MUTED, fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            width={40}
            allowDecimals={false}
          />

          {/* Target corridor */}
          <Area
            dataKey="band"
            stroke="none"
            fill={COBALT}
            fillOpacity={0.13}
            isAnimationActive={false}
            activeDot={false}
          />
          <Line
            dataKey="target"
            stroke={COBALT}
            strokeWidth={1}
            strokeDasharray="3 5"
            strokeOpacity={0.55}
            dot={false}
            isAnimationActive={false}
            activeDot={false}
          />

          {/* Raw readings — faint, deliberately secondary */}
          <Line
            dataKey="raw"
            stroke="transparent"
            dot={{ r: 1.8, fill: MUTED, stroke: "none" }}
            activeDot={false}
            isAnimationActive={false}
            connectNulls={false}
          />

          {/* The signal */}
          <Line
            dataKey="avg"
            stroke="url(#avgStroke)"
            strokeWidth={2.6}
            strokeLinecap="round"
            strokeLinejoin="round"
            dot={false}
            activeDot={false}
            isAnimationActive={false}
            connectNulls
          />

          {last && last.avg !== null ? (
            <ReferenceLine
              segment={[
                { x: last.day, y: last.avg },
                { x: last.day, y: last.avg },
              ]}
              stroke="none"
              label={undefined}
            />
          ) : null}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
        <Legend color={lastOut ? CRIMSON : COBALT} text="7-day average" solid />
        <Legend color={MUTED} text="Daily reading" />
        <Legend color={COBALT} text={`Corridor ±${CORRIDOR_TOLERANCE_KG} kg`} band />
      </div>
    </div>
  );
}

function Legend({
  color,
  text,
  solid,
  band,
}: {
  color: string;
  text: string;
  solid?: boolean;
  band?: boolean;
}) {
  return (
    <span className="flex items-center gap-1.5">
      {band ? (
        <span className="h-2.5 w-4" style={{ background: color, opacity: 0.25 }} />
      ) : solid ? (
        <span className="h-0.5 w-4" style={{ background: color }} />
      ) : (
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      )}
      <span className="label-xs">{text}</span>
    </span>
  );
}
