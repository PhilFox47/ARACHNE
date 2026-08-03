"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Prescription, PrescribedExercise } from "@/lib/training";
import { saveSet, setCompleted } from "@/app/patrol/actions";
import { ImpactBurst } from "./ImpactBurst";
import { WebLoader } from "./WebLoader";
import { TensionLine } from "./TensionLine";

type LoggedSet = { setIndex: number; reps: number | null; weightKg: number | null; seconds: number | null };
type Logged = Record<string, LoggedSet[]>;
type PB = Record<string, { reps: number | null; weightKg: number | null; seconds: number | null } | null>;

export function SessionLogger({
  date,
  initialPrescription,
  initialLogged,
  personalBests,
  completed,
  initialRpe,
  initialNote,
  isDeload,
}: {
  date: string;
  initialPrescription: Prescription;
  initialLogged: Logged;
  personalBests: PB;
  completed: boolean;
  initialRpe: number | null;
  initialNote: string | null;
  isDeload: boolean;
}) {
  const router = useRouter();
  const [rx, setRx] = useState(initialPrescription);
  const [logged, setLogged] = useState<Logged>(initialLogged);
  const [done, setDone] = useState(completed);
  const [rpe, setRpe] = useState<number | null>(initialRpe);
  const [note, setNote] = useState(initialNote ?? "");
  const [burst, setBurst] = useState<{ x: number; y: number } | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const [, start] = useTransition();

  // Ask for a prescription once, on first open, if none has been issued yet.
  const fetchRx = useCallback(
    async (regenerate: boolean) => {
      setSuggesting(true);
      try {
        const res = await fetch("/api/suggest-session", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ date, regenerate }),
        });
        const body = await res.json();
        if (body.ok) setRx(body.prescription as Prescription);
      } catch {
        // The baseline prescription is already on screen. Nothing to do.
      } finally {
        setSuggesting(false);
      }
    },
    [date],
  );

  useEffect(() => {
    if (initialPrescription.source === "plan" && !completed) void fetchRx(false);
    // Only on mount — re-running would move the numbers mid-session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setsFor = (ex: PrescribedExercise) => logged[ex.key] ?? [];

  const completedSets = rx.exercises.reduce((n, ex) => n + setsFor(ex).length, 0);
  const targetSets = rx.exercises.reduce((n, ex) => n + ex.sets, 0);
  const pct = targetSets > 0 ? Math.round((completedSets / targetSets) * 100) : 0;

  const onSaveSet = (ex: PrescribedExercise, setIndex: number, v: { reps?: number | null; weightKg?: number | null; seconds?: number | null }) => {
    // Optimistic: the row fills instantly, the write follows.
    setLogged((prev) => {
      const list = [...(prev[ex.key] ?? [])].filter((s) => s.setIndex !== setIndex);
      const isEmpty = !v.reps && !v.weightKg && !v.seconds;
      if (!isEmpty) {
        list.push({ setIndex, reps: v.reps ?? null, weightKg: v.weightKg ?? null, seconds: v.seconds ?? null });
      }
      return { ...prev, [ex.key]: list.sort((a, b) => a.setIndex - b.setIndex) };
    });

    start(async () => {
      await saveSet({ date, exerciseKey: ex.key, exerciseName: ex.name, setIndex, ...v });
    });
  };

  const toggleComplete = (e: React.MouseEvent) => {
    const next = !done;
    setDone(next);

    if (next) {
      setBurst({ x: e.clientX, y: e.clientY });
      if (navigator.vibrate) navigator.vibrate([18, 45, 28, 45, 60]);
    } else if (navigator.vibrate) {
      navigator.vibrate(10);
    }

    start(async () => {
      await setCompleted(date, next, rpe, note.trim() || null);
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <ImpactBurst at={burst} onDone={() => setBurst(null)} />

      {/* ── Prescription source ── */}
      <div className="flex items-center justify-between gap-3">
        <p className="label-xs">
          {suggesting
            ? "Adjusting to your history"
            : rx.source === "ai"
              ? "Adjusted from your last sessions"
              : "Plan baseline"}
        </p>
        <button
          type="button"
          onClick={() => void fetchRx(true)}
          disabled={suggesting}
          className="label-xs underline disabled:opacity-40"
        >
          Re-suggest
        </button>
      </div>

      {isDeload ? (
        <div className="panel-hot p-3">
          <p className="text-sm text-ink">
            Low profile week — fewer rounds, roughly 70% load, nothing to failure.
          </p>
        </div>
      ) : null}

      {suggesting && rx.source === "plan" ? (
        <div className="panel py-6">
          <WebLoader label="Reading your history" />
        </div>
      ) : null}

      {/* ── Progress ── */}
      <div className="panel flex flex-col gap-2 p-3">
        <div className="flex items-baseline justify-between">
          <span className="label-xs">Sets logged</span>
          <span className="numeral text-lg text-ink tabular">
            {completedSets}
            <span className="text-muted-dim">/{targetSets}</span>
          </span>
        </div>
        <div className="relative h-1.5 w-full bg-panel-2">
          <div className="absolute inset-y-0 left-0 bg-cobalt transition-[width]" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* ── Exercises ── */}
      <ul className="flex flex-col gap-3">
        {rx.exercises.map((ex) => (
          <li key={ex.key}>
            <ExerciseCard
              ex={ex}
              sets={setsFor(ex)}
              pb={personalBests[ex.key] ?? null}
              onSave={(i, v) => onSaveSet(ex, i, v)}
            />
          </li>
        ))}
      </ul>

      <TensionLine accent={done} />

      {/* ── RPE + note ── */}
      <div className="panel flex flex-col gap-3 p-4">
        <p className="label-xs">How hard was it</p>
        <div className="grid grid-cols-5 gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => {
                setRpe(rpe === n ? null : n);
                if (navigator.vibrate) navigator.vibrate(6);
                start(async () => {
                  await setCompleted(date, done, rpe === n ? null : n, note.trim() || null);
                });
              }}
              className={`tap numeral border text-lg ${
                rpe === n ? "border-crimson bg-crimson text-ink" : "border-edge text-muted"
              }`}
            >
              {n}
            </button>
          ))}
        </div>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() =>
            start(async () => {
              await setCompleted(date, done, rpe, note.trim() || null);
            })
          }
          placeholder="Note — optional"
          aria-label="Session note"
          className="tap border border-edge bg-panel-2 px-3 text-sm text-ink outline-none placeholder:text-muted-dim focus:border-cobalt"
        />
      </div>

      {/* ── The moment ── */}
      <button
        type="button"
        onClick={toggleComplete}
        className={`tap display w-full border px-4 py-4 text-base tracking-widest transition-colors ${
          done
            ? "border-crimson bg-crimson text-ink"
            : "border-edge text-muted active:border-crimson active:text-crimson"
        }`}
      >
        {done ? "Patrol complete" : "Mark complete"}
      </button>

      {done ? (
        <p className="text-center text-xs text-muted-dim">Tap again to undo.</p>
      ) : null}
    </div>
  );
}

function ExerciseCard({
  ex,
  sets,
  pb,
  onSave,
}: {
  ex: PrescribedExercise;
  sets: LoggedSet[];
  pb: { reps: number | null; weightKg: number | null; seconds: number | null } | null;
  onSave: (setIndex: number, v: { reps?: number | null; weightKg?: number | null; seconds?: number | null }) => void;
}) {
  const byIndex = new Map(sets.map((s) => [s.setIndex, s]));
  const allDone = sets.length >= ex.sets;

  return (
    <div className={`panel flex flex-col gap-3 p-3 ${allDone ? "border-crimson-dim" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="display text-base text-ink">{ex.name}</span>
          <span className="label-xs">
            {ex.sets} × {ex.metric === "time" ? `${ex.targetSeconds ?? "—"} s` : (ex.repRange ?? ex.targetReps ?? "—")}
            {ex.targetWeightKg ? ` · ${ex.targetWeightKg} kg` : ""}
            {ex.perSide ? " · per side" : ""}
          </span>
          {ex.note ? <span className="text-xs text-muted-dim">{ex.note}</span> : null}
        </div>
        {pb ? (
          <span className="shrink-0 text-right">
            <span className="label-xs">Best</span>
            <span className="block text-xs text-cobalt-lift tabular">
              {ex.metric === "time"
                ? `${pb.seconds ?? "—"} s`
                : `${pb.reps ?? "—"}${pb.weightKg ? ` × ${pb.weightKg}kg` : ""}`}
            </span>
          </span>
        ) : null}
      </div>

      <ul className="flex flex-col gap-1.5">
        {Array.from({ length: ex.sets }, (_, i) => (
          <li key={i}>
            <SetRow
              index={i}
              metric={ex.metric}
              logged={byIndex.get(i) ?? null}
              targetReps={ex.targetReps}
              targetSeconds={ex.targetSeconds}
              targetWeight={ex.targetWeightKg}
              showWeight={ex.loaded || byIndex.get(i)?.weightKg != null}
              onSave={(v) => onSave(i, v)}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function SetRow({
  index,
  metric,
  logged,
  targetReps,
  targetSeconds,
  targetWeight,
  showWeight,
  onSave,
}: {
  index: number;
  metric: "reps" | "time";
  logged: LoggedSet | null;
  targetReps: number | null;
  targetSeconds: number | null;
  targetWeight: number | null;
  showWeight: boolean;
  onSave: (v: { reps?: number | null; weightKg?: number | null; seconds?: number | null }) => void;
}) {
  const [primary, setPrimary] = useState(
    logged ? String((metric === "time" ? logged.seconds : logged.reps) ?? "") : "",
  );
  const [weight, setWeight] = useState(logged?.weightKg != null ? String(logged.weightKg) : "");
  const [weightOpen, setWeightOpen] = useState(showWeight);
  const filled = logged !== null;

  const commit = (p: string, w: string) => {
    const pv = p.trim() === "" ? null : Number(p);
    const wv = w.trim() === "" ? null : Number(w);
    onSave(
      metric === "time"
        ? { seconds: pv, weightKg: wv }
        : { reps: pv, weightKg: wv },
    );
  };

  /** One tap fills the set with today's target — the common case. */
  const fillTarget = () => {
    const p = String((metric === "time" ? targetSeconds : targetReps) ?? "");
    const w = targetWeight != null ? String(targetWeight) : "";
    setPrimary(p);
    setWeight(w);
    commit(p, w);
    if (navigator.vibrate) navigator.vibrate(6);
  };

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={filled ? () => { setPrimary(""); setWeight(""); commit("", ""); } : fillTarget}
        aria-label={filled ? `Clear set ${index + 1}` : `Fill set ${index + 1} with target`}
        className={`flex h-9 w-9 shrink-0 items-center justify-center border text-xs ${
          filled ? "border-crimson bg-crimson/15 text-crimson" : "border-edge text-muted-dim"
        }`}
      >
        {filled ? "✓" : index + 1}
      </button>

      <input
        value={primary}
        onChange={(e) => setPrimary(e.target.value)}
        onBlur={() => commit(primary, weight)}
        inputMode="numeric"
        placeholder={String((metric === "time" ? targetSeconds : targetReps) ?? "—")}
        aria-label={metric === "time" ? "Seconds" : "Reps"}
        className="numeral h-9 min-w-0 flex-1 border border-edge bg-panel-2 px-2 text-base text-ink outline-none placeholder:text-muted-dim focus:border-cobalt"
      />
      <span className="label-xs w-6 shrink-0">{metric === "time" ? "s" : "rep"}</span>

      {weightOpen ? (
        <>
          <input
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            onBlur={() => commit(primary, weight)}
            inputMode="decimal"
            placeholder={targetWeight != null ? String(targetWeight) : "—"}
            aria-label="Weight in kilograms"
            className="numeral h-9 w-16 shrink-0 border border-edge bg-panel-2 px-2 text-base text-ink outline-none placeholder:text-muted-dim focus:border-cobalt"
          />
          <span className="label-xs w-4 shrink-0">kg</span>
        </>
      ) : (
        <button
          type="button"
          onClick={() => setWeightOpen(true)}
          aria-label="Add weight to this set"
          className="label-xs h-9 w-[4.75rem] shrink-0 border border-dashed border-edge text-muted-dim"
        >
          + kg
        </button>
      )}
    </div>
  );
}
