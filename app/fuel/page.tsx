import { redirect } from "next/navigation";
import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { isAuthed } from "@/lib/auth";
import { db } from "@/lib/db";
import { foodEntries } from "@/lib/db/schema";
import { getHqStats } from "@/lib/stats";
import { getSettings } from "@/lib/settings";
import { todayISO } from "@/lib/dates";
import { PROTEIN_PER_MEAL_G } from "@/lib/plan";
import { quickLogCandidates } from "./actions";
import { waterForDate } from "./water";
import { FuelCapture } from "@/components/FuelCapture";
import { WaterTracker } from "@/components/WaterTracker";
import { FuelEntryRow } from "@/components/FuelEntry";
import { BottomNav } from "@/components/BottomNav";
import { TensionLine } from "@/components/TensionLine";

export const dynamic = "force-dynamic";

export default async function Fuel() {
  if (!(await isAuthed())) redirect("/login");

  const stats = getHqStats();
  const today = todayISO();

  const entries = db
    .select()
    .from(foodEntries)
    .where(eq(foodEntries.date, today))
    .orderBy(asc(foodEntries.loggedAt))
    .all();

  const quick = await quickLogCandidates();
  const water = await waterForDate(today);
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
  const target = stats.kcalTarget;
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
            <p className="label-xs">{isPhase0 ? "Today · tracking only" : "Today"}</p>
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
          <Macro label="Protein" value={protein} unit="g" accent={protein >= PROTEIN_PER_MEAL_G * 3} />
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

      <WaterTracker initialMl={water.ml} targetMl={settings.waterTargetMl} date={today} />

      <FuelCapture quickItems={quick} />

      {/* ── The log ── */}
      <section className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <p className="label-xs">Today&apos;s log</p>
          {unpriced > 0 ? <p className="label-xs text-crimson">{unpriced} without numbers</p> : null}
        </div>

        {entries.length === 0 ? (
          <div className="panel p-4">
            <p className="text-sm text-muted">Nothing logged today.</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {entries.map((e) => (
              <li key={e.id}>
                <FuelEntryRow entry={e} />
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
}: {
  label: string;
  value: number;
  unit: string;
  bordered?: boolean;
  accent?: boolean;
}) {
  return (
    <div className={`flex flex-col gap-1 p-2.5 ${bordered ? "border-l border-edge" : ""}`}>
      <span className={`numeral text-xl tabular ${accent ? "text-crimson" : "text-ink"}`}>
        {Math.round(value)}
        <span className="text-[0.5em] text-muted">{unit}</span>
      </span>
      <span className="label-xs leading-tight">{label}</span>
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
