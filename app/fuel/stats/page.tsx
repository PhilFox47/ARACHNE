import { redirect } from "next/navigation";
import Link from "next/link";
import { isAuthed } from "@/lib/auth";
import { needsOnboarding } from "@/lib/onboarding";
import { buildFuelStats } from "@/lib/fuelStats";
import { PROTEIN_PER_MEAL_G } from "@/lib/plan";
import { CountUp } from "@/components/CountUp";
import { TensionLine } from "@/components/TensionLine";
import { BottomNav } from "@/components/BottomNav";
import {
  HourChart,
  IntakeChart,
  SnackSplitChart,
  WaterChart,
  WeekdayChart,
} from "@/components/FuelCharts";

export const dynamic = "force-dynamic";

const PERIODS = [7, 30, 90] as const;

export default async function FuelStats({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  if (!(await isAuthed())) redirect("/login");
  if (needsOnboarding()) redirect("/onboarding");

  const params = await searchParams;
  const requested = Number(params.days);
  const period = (PERIODS as readonly number[]).includes(requested) ? requested : 30;

  const st = buildFuelStats(period);
  const t = st.totals;
  const coverage = t.daysInPeriod > 0 ? Math.round((t.daysLogged / t.daysInPeriod) * 100) : 0;

  return (
    <main className="relative z-10 mx-auto flex max-w-lg flex-col gap-5 px-4 pb-28 pt-3">
      <header className="pad-safe-t flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <Link href="/fuel" className="label-xs">
            ‹ FUEL
          </Link>
          <h1 className="display text-2xl text-ink">INTAKE</h1>
        </div>
        <span className="label-xs tabular">
          {t.daysLogged} / {t.daysInPeriod} days logged
        </span>
      </header>

      {/* ── Period ── */}
      <nav className="grid grid-cols-3 gap-2">
        {PERIODS.map((p) => (
          <Link
            key={p}
            href={`/fuel/stats?days=${p}`}
            className={`tap display flex items-center justify-center border py-2 text-xs tracking-widest ${
              p === period ? "border-crimson bg-crimson/15 text-crimson" : "border-edge text-muted"
            }`}
          >
            {p} days
          </Link>
        ))}
      </nav>

      {/* ── Headline ── */}
      <section className="swing panel halftone flex flex-col gap-4 p-4">
        <div className="flex items-end justify-between gap-4">
          <div className="flex flex-col gap-1.5">
            <p className="label-xs">Average intake</p>
            <CountUp
              value={t.avgKcal}
              decimals={0}
              suffix="KCAL"
              className="numeral text-[3.5rem] text-ink"
            />
          </div>
          <div className="flex flex-col items-end gap-1">
            <p className="label-xs">From snacks</p>
            <CountUp
              value={t.snackPct}
              decimals={0}
              suffix="%"
              className={`numeral text-3xl ${(t.snackPct ?? 0) > 20 ? "text-crimson" : "text-cobalt-lift"}`}
            />
          </div>
        </div>

        <TensionLine accent={(t.snackPct ?? 0) > 20} />

        <div className="grid grid-cols-3 border border-edge">
          <Cell
            value={t.avgProteinG}
            label="Protein/day"
            unit="g"
            accent={(t.avgProteinG ?? 0) >= PROTEIN_PER_MEAL_G * 3}
          />
          <Cell
            value={t.avgWaterMl === null ? null : Math.round(t.avgWaterMl / 100) / 10}
            label="Water/day"
            unit="L"
            decimals={1}
            accent={(t.avgWaterMl ?? 0) >= st.waterTargetMl}
            bordered
          />
          <Cell value={coverage} label="Tracked" unit="%" bordered />
        </div>

        <p className="text-xs leading-relaxed text-muted-dim">
          Averages count only days you actually logged — {t.daysLogged} of {t.daysInPeriod}. Including untracked
          days as zeros would flatter every number here.
        </p>
      </section>

      {/* ── Intake over time ── */}
      <Panel title="Calories over time">
        <IntakeChart days={st.days} />
      </Panel>

      {/* ── The one that matters ── */}
      <Panel
        title="Snacks vs meals"
        note="The number most likely to change what you do. Unplanned eating hides here, not in dinner portions."
      >
        <SnackSplitChart days={st.days} />
      </Panel>

      <Panel title="Water" note={`Target ${(st.waterTargetMl / 1000).toFixed(1)} L · met on ${t.waterDaysMet} of ${t.daysInPeriod} days.`}>
        <WaterChart days={st.days} targetMl={st.waterTargetMl} />
      </Panel>

      <Panel title="When you eat">
        <HourChart hourly={st.hourly} />
      </Panel>

      <Panel title="By weekday" note="Daily averages across tracked days. A tall crimson bar is a habit, not an accident.">
        <WeekdayChart weekday={st.weekday} />
      </Panel>

      {/* ── What's actually driving the snacks ── */}
      {st.topSnacks.length > 0 ? (
        <section className="flex flex-col gap-2">
          <p className="label-xs">Top snacks by total energy</p>
          <ul className="panel divide-y divide-edge">
            {st.topSnacks.map((s) => (
              <li key={s.description} className="flex items-baseline justify-between gap-3 px-4 py-2.5">
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-sm text-ink">{s.description}</span>
                  <span className="label-xs">
                    {s.count}× · {s.avgKcal} kcal each
                  </span>
                </span>
                <span className="numeral shrink-0 text-lg text-crimson tabular">
                  {Math.round(s.totalKcal).toLocaleString("en-GB")}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* ── Weekly ── */}
      {st.weeks.length > 1 ? (
        <section className="flex flex-col gap-2">
          <p className="label-xs">By week</p>
          <div className="overflow-x-auto border border-edge">
            <table className="w-full min-w-[26rem] border-collapse text-sm">
              <thead>
                <tr>
                  {["Week", "Days", "kcal", "Protein", "Water", "Snack"].map((h) => (
                    <th
                      key={h}
                      className="border-b border-edge bg-panel-2 px-3 py-2 text-left text-[0.6rem] uppercase tracking-[0.16em] font-normal text-muted"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {st.weeks.map((w) => (
                  <tr key={w.weekIndex}>
                    <td className="border-b border-edge px-3 py-2 text-xs text-muted">{w.label}</td>
                    <td className="border-b border-edge px-3 py-2 text-xs tabular text-muted">{w.daysLogged}</td>
                    <td
                      className={`border-b border-edge px-3 py-2 tabular ${
                        w.avgKcal !== null && w.avgKcal > w.kcalTarget ? "text-crimson" : "text-ink"
                      }`}
                    >
                      {w.avgKcal ?? "—"}
                    </td>
                    <td className="border-b border-edge px-3 py-2 tabular text-ink">{w.avgProteinG ?? "—"}</td>
                    <td className="border-b border-edge px-3 py-2 tabular text-ink">
                      {w.avgWaterMl === null ? "—" : `${(w.avgWaterMl / 1000).toFixed(1)}L`}
                    </td>
                    <td
                      className={`border-b border-edge px-3 py-2 tabular ${
                        (w.snackPct ?? 0) > 20 ? "text-crimson" : "text-muted"
                      }`}
                    >
                      {w.snackPct === null ? "—" : `${w.snackPct}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <p className="px-1 text-xs leading-relaxed text-muted-dim">
        Days on target: {t.kcalDaysUnder} at or under calories, {t.proteinDaysMet} at protein,{" "}
        {t.waterDaysMet} at water.
      </p>

      <BottomNav />
    </main>
  );
}

function Panel({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="panel flex flex-col gap-3 p-4">
      <p className="label-xs">{title}</p>
      {note ? <p className="text-xs leading-relaxed text-muted">{note}</p> : null}
      {children}
    </section>
  );
}

function Cell({
  value,
  label,
  unit,
  decimals = 0,
  accent,
  bordered,
}: {
  value: number | null;
  label: string;
  unit: string;
  decimals?: number;
  accent?: boolean;
  bordered?: boolean;
}) {
  return (
    <div className={`flex flex-col gap-1.5 p-2.5 ${bordered ? "border-l border-edge" : ""}`}>
      <CountUp
        value={value}
        decimals={decimals}
        suffix={unit}
        className={`numeral text-xl ${accent ? "text-cobalt-lift" : "text-ink"}`}
      />
      <span className="label-xs leading-tight">{label}</span>
    </div>
  );
}
