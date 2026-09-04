import { redirect } from "next/navigation";
import { isAuthed } from "@/lib/auth";
import { needsOnboarding } from "@/lib/onboarding";
import { buildComposition, buildSeries, compositionSummary, getHqStats, loadWeights } from "@/lib/stats";
import { getSettings } from "@/lib/settings";
import { formatShort, todayISO, weekIndex } from "@/lib/dates";
import Link from "next/link";
import { desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { photos } from "@/lib/db/schema";
import { navyBodyFat } from "@/lib/plan";
import { WeightChart } from "@/components/WeightChart";
import { CompositionChart } from "@/components/CompositionChart";
import { WeightEntry } from "@/components/WeightEntry";
import { CountUp } from "@/components/CountUp";
import { BottomNav } from "@/components/BottomNav";
import { TensionLine } from "@/components/TensionLine";

export const dynamic = "force-dynamic";

export default async function Vitals() {
  if (!(await isAuthed())) redirect("/login");
  if (needsOnboarding()) redirect("/onboarding");

  const settings = getSettings();
  const rows = loadWeights();
  const stats = getHqStats();
  const series = buildSeries(rows, settings.startDate);
  const composition = buildComposition(rows);
  const split = compositionSummary(composition);
  const recent = [...rows].reverse().slice(0, 30);

  const wk = weekIndex(settings.startDate, todayISO());
  const shotsThisWeek = db.select().from(photos).orderBy(desc(photos.weekIndex)).all();
  const thisWeekCount = shotsThisWeek.filter((p) => p.weekIndex === wk).length;

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
          bodyfatToday={stats.loggedToday ? (stats.latest?.bodyfatPct ?? null) : null}
          tracksBodyfat={stats.latestBodyfat !== null}
          loggedToday={stats.loggedToday}
          today={todayISO()}
        />
      </div>

      {/* ── Composition ── */}
      <section className="panel flex flex-col gap-3 p-4">
        <div className="flex items-baseline justify-between gap-3">
          <p className="label-xs">Composition</p>
          {stats.latestBodyfat ? (
            <p className="label-xs tabular">
              {stats.latestBodyfat.pct.toFixed(1)}% on {formatShort(stats.latestBodyfat.date)}
            </p>
          ) : null}
        </div>

        <CompositionChart points={composition} height={200} />

        {split ? (
          <>
            <div className="grid grid-cols-3 border border-edge">
              <Cell
                label="Fat mass"
                value={split.fatDeltaKg}
                good={split.fatDeltaKg < 0}
              />
              <Cell label="Lean mass" value={split.leanDeltaKg} good={split.leanDeltaKg >= 0} bordered />
              <div className="flex flex-col gap-1.5 border-l border-edge p-2.5">
                <span className="numeral text-2xl text-ink tabular">
                  {split.fatShare === null ? "—" : `${Math.round(split.fatShare * 100)}%`}
                </span>
                <span className="label-xs leading-tight">Of change was fat</span>
              </div>
            </div>
            <p className="text-xs leading-relaxed text-muted-dim">
              Across {split.spanDays} days. Losing weight is easy; losing it from the right tissue is the
              whole job. Anything at or above 75% fat is the deficit working as intended — if lean mass is
              falling instead, the answer is more protein and less hurry, not fewer calories.
            </p>
          </>
        ) : (
          <p className="text-xs leading-relaxed text-muted-dim">
            Log the body-fat reading with your weight for a fortnight and this tracks which way it is going,
            and how much of what you have lost came off as fat rather than muscle — the number that decides
            whether the deficit is working.
          </p>
        )}
      </section>

      {/* Two body-fat numbers exist, they disagree, and pretending otherwise
          would be worse than explaining it. */}
      <section className="panel flex flex-col gap-2 p-4">
        <p className="label-xs">Two body-fat numbers</p>
        <p className="text-sm leading-relaxed text-muted">
          The scale measures bioimpedance — fast, daily, and swayed by how hydrated you are. The tape measure
          feeds the US Navy formula from waist and neck
          {settings.heightCm ? ` at ${settings.heightCm} cm` : ""}, which is slower but not affected by last
          night&apos;s water. They will disagree by several points. Neither is corrected against the other;
          each is tracked on its own, and it&apos;s the direction that counts.
        </p>
        {/* Worked example so the formula is verifiable before any data exists. */}
        <p className="label-xs text-muted-dim">
          Navy example: 110 cm waist, 40 cm neck &rarr; {navyBodyFat(110, 40, settings.heightCm)}% estimated
        </p>
      </section>

      <Link
        href="/suit-check"
        className={`flex items-center justify-between p-4 ${thisWeekCount >= 4 ? "panel" : "panel-hot"}`}
      >
        <span className="flex flex-col gap-1">
          <span className="display text-sm text-ink">Suit check</span>
          <span className="label-xs">
            {thisWeekCount >= 4
              ? `Week ${wk + 1} complete · compare any two weeks`
              : `Week ${wk + 1} · ${thisWeekCount} of 4 angles`}
          </span>
        </span>
        <span className="text-crimson">&rarr;</span>
      </Link>

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
                <span className="flex items-baseline gap-3">
                  {r.bodyfatPct !== null ? (
                    <span className="numeral text-sm text-crimson tabular">{r.bodyfatPct.toFixed(1)}%</span>
                  ) : null}
                  <span className="numeral text-lg text-ink tabular">{r.weightKg.toFixed(1)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <BottomNav />
    </main>
  );
}

function Cell({
  label,
  value,
  good,
  bordered,
}: {
  label: string;
  value: number;
  good: boolean;
  bordered?: boolean;
}) {
  return (
    <div className={`flex flex-col gap-1.5 p-2.5 ${bordered ? "border-l border-edge" : ""}`}>
      <span className={`numeral text-2xl tabular ${good ? "text-cobalt-lift" : "text-crimson"}`}>
        {value > 0 ? "+" : ""}
        {value.toFixed(1)}
      </span>
      <span className="label-xs leading-tight">{label}</span>
    </div>
  );
}
