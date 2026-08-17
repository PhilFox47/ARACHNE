import { redirect } from "next/navigation";
import Link from "next/link";
import { asc, eq, inArray } from "drizzle-orm";
import { isAuthed } from "@/lib/auth";
import { needsOnboarding } from "@/lib/onboarding";
import { db } from "@/lib/db";
import { foodEntries, mealPhotos } from "@/lib/db/schema";
import { getHqStats } from "@/lib/stats";
import { getSettings } from "@/lib/settings";
import { addDays, daysBetween, formatShort, todayISO } from "@/lib/dates";
import { kcalTargetForDay, proteinTargetForDay } from "@/lib/course";
import { listFavourites, quickLogCandidates } from "./actions";
import { waterForDate } from "./water";
import { FuelCapture } from "@/components/FuelCapture";
import { WaterTracker } from "@/components/WaterTracker";
import { FuelEntryRow } from "@/components/FuelEntry";
import { BottomNav } from "@/components/BottomNav";
import { TensionLine } from "@/components/TensionLine";

export const dynamic = "force-dynamic";

export default async function Fuel({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  if (!(await isAuthed())) redirect("/login");
  if (needsOnboarding()) redirect("/onboarding");

  const stats = getHqStats();
  const today = todayISO();

  /**
   * Which day's log is on screen.
   *
   * This page was hard-wired to today, which meant a meal logged yesterday
   * could never be corrected and never be deleted — while the stats screen went
   * on counting it for the next ninety days. Every number on the review was
   * therefore reachable and none of the entries behind it were.
   *
   * Never later than today: there is no such thing as a meal you have not
   * eaten yet, and a date box that accepts one is a way to lose an entry.
   */
  const params = await searchParams;
  const asked = /^\d{4}-\d{2}-\d{2}$/.test(params.date ?? "") ? params.date! : today;
  const date = asked > today ? today : asked;
  const isToday = date === today;

  const entries = db
    .select()
    .from(foodEntries)
    .where(eq(foodEntries.date, date))
    .orderBy(asc(foodEntries.loggedAt))
    .all();

  // One query for every photo on the day rather than one per row — the strip is
  // rendered inside each entry, but the entries are already all in hand.
  const ids = entries.map((e) => e.id);
  const shots = ids.length
    ? db
        .select()
        .from(mealPhotos)
        .where(inArray(mealPhotos.entryId, ids))
        .orderBy(asc(mealPhotos.sort), asc(mealPhotos.id))
        .all()
    : [];
  const photosByEntry = new Map<number, typeof shots>();
  for (const s of shots) photosByEntry.set(s.entryId, [...(photosByEntry.get(s.entryId) ?? []), s]);

  const quick = await quickLogCandidates();
  const favourites = await listFavourites();
  const starred = new Set(favourites.map((f) => f.normKey));
  const water = await waterForDate(date);
  const settings = getSettings();

  type NutrientKey = "kcal" | "proteinG" | "carbsG" | "fatG" | "fiberG" | "sugarG" | "saltG";
  const sum = (f: NutrientKey) => entries.reduce((s, e) => s + (e[f] ?? 0), 0);

  const kcal = sum("kcal");
  const protein = sum("proteinG");
  const carbs = sum("carbsG");
  const fat = sum("fatG");
  const fiber = sum("fiberG");
  const sugar = sum("sugarG");
  const salt = sum("saltG");

  const snackKcal = entries
    .filter((e) => e.mealType === "snack")
    .reduce((s, e) => s + (e.kcal ?? 0), 0);
  const snackPct = kcal > 0 ? Math.round((snackKcal / kcal) * 100) : 0;

  const isPhase0 = stats.phase.id === 0;
  // The target belongs to the day on screen, not to today. Judging a Tuesday in
  // Phase 1 against Phase 3's number would be quietly wrong every time you
  // stepped back to check one.
  const dayIndex = Math.max(0, daysBetween(settings.startDate, date));
  const target = kcalTargetForDay(dayIndex).kcal;
  // The phase's own figure — 160 g through Phase 1, not three meals' worth.
  const proteinTarget = proteinTargetForDay(dayIndex);
  const pct = target > 0 ? Math.min(100, Math.round((kcal / target) * 100)) : 0;
  const over = kcal > target;
  const unpriced = entries.filter((e) => e.kcal === null).length;

  return (
    <main className="relative z-10 mx-auto flex max-w-lg flex-col gap-5 px-4 pb-28 pt-3">
      <header className="pad-safe-t flex items-baseline justify-between">
        <h1 className="display text-2xl text-ink">FUEL</h1>
        <div className="flex items-baseline gap-3">
          <span className="label-xs tabular">
            {entries.length} {entries.length === 1 ? "entry" : "entries"}
          </span>
          <Link href="/fuel/stats" className="label-xs text-cobalt-lift underline">
            Stats
          </Link>
        </div>
      </header>

      {/* ── Which day ── */}
      <nav className="flex items-center justify-between gap-2">
        <Link
          href={`/fuel?date=${addDays(date, -1)}`}
          aria-label="The day before"
          className="tap flex items-center px-1 text-muted active:text-crimson"
        >
          ‹
        </Link>
        <div className="flex flex-col items-center gap-0.5">
          <span className="display text-lg text-ink">
            {isToday ? "Today" : formatShort(date)}
          </span>
          {!isToday ? (
            <Link href="/fuel" className="label-xs text-cobalt-lift underline">
              Back to today
            </Link>
          ) : (
            <span className="label-xs">{formatShort(date)}</span>
          )}
        </div>
        <Link
          href={isToday ? "/fuel" : `/fuel?date=${addDays(date, 1)}`}
          aria-label="The day after"
          aria-disabled={isToday}
          className={`tap flex items-center px-1 ${
            isToday ? "pointer-events-none opacity-25" : "text-muted active:text-crimson"
          }`}
        >
          ›
        </Link>
      </nav>

      {isPhase0 ? (
        <div className="panel border-l-2 border-l-cobalt p-3.5">
          <p className="label-xs text-cobalt-lift">Calibration</p>
          <p className="mt-1 text-sm text-ink">
            No deficit yet. Track everything honestly and find out how close the estimates really are — that
            calibration is the whole job of these two weeks. {target.toLocaleString("en-GB")} kcal is
            maintenance, not a limit.
          </p>
        </div>
      ) : null}

      {/* ── The number ── */}
      <section className="swing panel halftone flex flex-col gap-4 p-4">
        <div className="flex items-end justify-between gap-4">
          <div className="flex flex-col gap-1.5">
            <p className="label-xs">
              {isToday ? "Today" : formatShort(date)}
              {isPhase0 ? " · tracking only" : ""}
            </p>
            <p className={`numeral text-[3.75rem] tabular ${over && !isPhase0 ? "text-crimson" : "text-ink"}`}>
              {Math.round(kcal).toLocaleString("en-GB")}
              <span className="ml-1.5 text-[0.28em] tracking-normal text-muted">KCAL</span>
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <p className="label-xs">Target</p>
            <p className="numeral text-2xl text-muted tabular">{target.toLocaleString("en-GB")}</p>
          </div>
        </div>

        <div className="relative h-2 w-full border border-edge bg-panel-2">
          <div
            className={`absolute inset-y-0 left-0 ${over && !isPhase0 ? "bg-crimson" : "bg-cobalt"}`}
            style={{ width: `${pct}%` }}
          />
        </div>

        <TensionLine accent={over && !isPhase0} />

        <div className="grid grid-cols-4 border border-edge">
          <Macro label="Protein" value={protein} unit="g" goal={proteinTarget} accent={protein >= proteinTarget} />
          <Macro label="Carbs" value={carbs} unit="g" bordered />
          <Macro label="Fat" value={fat} unit="g" bordered />
          <Macro label="Fibre" value={fiber} unit="g" bordered />
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <Mini label="Sugar" value={sugar} unit="g" />
          <Mini label="Salt" value={salt} unit="g" />
          <Mini label="From snacks" value={snackPct} unit="%" accent={snackPct > 20} />
        </div>
      </section>

      <WaterTracker initialMl={water.ml} targetMl={settings.waterTargetMl} date={date} />

      <FuelCapture
        date={date}
        quickItems={quick}
        favourites={favourites.map((f) => ({
          id: f.id,
          normKey: f.normKey,
          label: f.label,
          kcal: f.kcal,
          mealType: f.mealType,
          uses: f.uses,
        }))}
      />

      {/* ── The log ── */}
      <section className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <p className="label-xs">{isToday ? "Today's log" : `${formatShort(date)} — log`}</p>
          {unpriced > 0 ? <p className="label-xs text-crimson">{unpriced} without numbers</p> : null}
        </div>

        {entries.length === 0 ? (
          <div className="panel p-4">
            <p className="text-sm text-muted">
              {isToday ? "Nothing logged today." : "Nothing logged on this day."}
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {entries.map((e) => (
              <li key={e.id}>
                <FuelEntryRow
                  entry={e}
                  photos={photosByEntry.get(e.id) ?? []}
                  isFavourite={starred.has(e.normKey)}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <Link href="/fuel/stats" className="panel flex items-center justify-between p-4">
        <span className="flex flex-col gap-1">
          <span className="display text-sm text-ink">Intake over time</span>
          <span className="label-xs">Calories, water, snack split, and when you actually eat</span>
        </span>
        <span className="text-crimson">&rarr;</span>
      </Link>

      <p className="px-1 text-xs leading-relaxed text-muted-dim">
        Estimates assume German portions and packaging. The point is seeing what you actually eat across a
        week, not accuracy to 20 kcal.
      </p>

      <BottomNav />
    </main>
  );
}

function Macro({
  label,
  value,
  unit,
  bordered,
  accent,
  goal,
}: {
  label: string;
  value: number;
  unit: string;
  bordered?: boolean;
  accent?: boolean;
  /** Shown under the label where the plan states a figure to hit. */
  goal?: number;
}) {
  return (
    <div className={`flex flex-col gap-1 p-2.5 ${bordered ? "border-l border-edge" : ""}`}>
      <span className={`numeral text-xl tabular ${accent ? "text-crimson" : "text-ink"}`}>
        {Math.round(value)}
        <span className="text-[0.5em] text-muted">{unit}</span>
      </span>
      <span className="label-xs leading-tight">
        {label}
        {goal !== undefined ? <span className="text-muted-dim"> / {goal}</span> : null}
      </span>
    </div>
  );
}

function Mini({ label, value, unit, accent }: { label: string; value: number; unit: string; accent?: boolean }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className={`numeral text-sm tabular ${accent ? "text-crimson" : "text-muted"}`}>
        {Math.round(value * 10) / 10}
        {unit}
      </span>
      <span className="label-xs">{label}</span>
    </span>
  );
}
