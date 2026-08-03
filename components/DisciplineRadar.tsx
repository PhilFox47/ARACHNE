"use client";

import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
} from "recharts";
import type { Discipline } from "@/lib/game";

/**
 * The five training days as five independent tracks. The shape is the point —
 * a lopsided pentagon says which session you've been quietly skipping far
 * faster than a list of counts does.
 *
 * Polar geometry is also the right fit for the identity: it's the same radial
 * lattice the mark is built from.
 */
export function DisciplineRadar({ disciplines }: { disciplines: Discipline[] }) {
  const hasData = disciplines.some((d) => d.sessions > 0);

  const data = disciplines.map((d) => ({
    axis: d.name,
    value: hasData ? Math.max(d.share * 100, 3) : 0,
  }));

  return (
    <div className="flex flex-col gap-3">
      <div style={{ width: "100%", height: 240 }}>
        <ResponsiveContainer>
          <RadarChart data={data} outerRadius="72%">
            <PolarGrid stroke="#243050" gridType="polygon" />
            <PolarAngleAxis
              dataKey="axis"
              tick={{ fill: "#8A92A6", fontSize: 9, letterSpacing: 1.5 }}
            />
            <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
            <Radar
              dataKey="value"
              stroke="#D42A3F"
              strokeWidth={2}
              fill="#D42A3F"
              fillOpacity={0.22}
              isAnimationActive={false}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>

      <ul className="flex flex-col divide-y divide-edge border border-edge">
        {disciplines.map((d) => (
          <li key={d.key} className="flex flex-col gap-1.5 px-3 py-2.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="display text-sm text-ink">{d.name}</span>
              <span className="flex items-baseline gap-2">
                <span className="text-xs text-muted">{d.title}</span>
                <span className="numeral text-base text-crimson tabular">{d.level}</span>
              </span>
            </div>
            <div className="relative h-1 w-full bg-panel-2">
              <div
                className="absolute inset-y-0 left-0 bg-cobalt"
                style={{ width: `${Math.round(d.progress * 100)}%` }}
              />
            </div>
            <span className="label-xs">
              {d.sessions} session{d.sessions === 1 ? "" : "s"} · {d.xp.toLocaleString("en-GB")} XP
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
