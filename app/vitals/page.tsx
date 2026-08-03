import { redirect } from "next/navigation";
import { isAuthed } from "@/lib/auth";
import { buildSeries, getHqStats, loadWeights } from "@/lib/stats";
import { getSettings } from "@/lib/settings";
import { formatShort, todayISO } from "@/lib/dates";
import { navyBodyFat } from "@/lib/plan";
import { WeightChart } from "@/components/WeightChart";
import { WeightEntry } from "@/components/WeightEntry";
import { CountUp } from "@/components/CountUp";
import { BottomNav } from "@/components/BottomNav";
import { TensionLine } from "@/components/TensionLine";

export const dynamic = "force-dynamic";

export default async function Vitals() {
  if (!(await isAuthed())) redirect("/login");

  const settings = getSettings();
  const rows = loadWeights();
  const stats = getHqStats();
  const series = buildSeries(rows, settings.startDate);
  const recent = [...rows].reverse().slice(0, 30);

  return (
    <main className="relative z-10 mx-auto flex max-w-lg flex-col gap-5 px-4 pb-28 pt-3">
      <header className="pad-safe-t flex items-baseline justify-between">
        <h1 className="display text-2xl text-ink">VITALS</h1>
        <span className="label-xs tabular">{rows.length} readings</span>
      </header>

      <section className="swing panel flex flex-col gap-4 p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1.5">
            <p className="label-xs">7-day average</p>
            <CountUp value={stats.avg7} decimals={1} suffix="KG" className="numeral text-6xl text-ink" />
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <p className="label-xs">To target</p>
            <CountUp
              value={stats.avg7 === null ? null : stats.avg7 - stats.targetWeightKg}
              decimals={1}
              className="numeral text-3xl text-cobalt-lift"
            />
          </div>
        </div>
        <TensionLine />
        <WeightChart points={series} height={260} />
      </section>

      <div className="swing" style={{ animationDelay: "60ms" }}>
        <WeightEntry
          initial={stats.latest?.weightKg ?? settings.startWeightKg}
          loggedToday={stats.loggedToday}
          today={todayISO()}
        />
      </div>

      {/* Measurements land in Phase 4 — this states the plan rather than
          pretending the screen is finished. */}
      <section className="panel flex flex-col gap-2 p-4">
        <p className="label-xs">Measurements</p>
        <p className="text-sm text-muted">
          Waist, neck, chest, thigh and upper arm arrive with THE TRIAL. Body fat is estimated from waist
          and neck by the US Navy formula
          {settings.heightCm ? ` at ${settings.heightCm} cm` : ""} — a few percentage points of error either
          way, so the trend across months is what means anything, not the number.
        </p>
        {/* Worked example so the formula is verifiable before any data exists. */}
        <p className="label-xs text-muted-dim">
          Example: 110 cm waist, 40 cm neck &rarr; {navyBodyFat(110, 40, settings.heightCm)}% estimated
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <p className="label-xs">Log</p>
        {recent.length === 0 ? (
          <div className="panel p-4">
            <p className="text-sm text-muted">No vitals on record.</p>
          </div>
        ) : (
          <ul className="panel divide-y divide-edge">
            {recent.map((r) => (
              <li key={r.date} className="flex items-baseline justify-between px-4 py-2.5">
                <span className="text-sm text-muted">{formatShort(r.date)}</span>
                <span className="numeral text-lg text-ink tabular">{r.weightKg.toFixed(1)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <BottomNav />
    </main>
  );
}
