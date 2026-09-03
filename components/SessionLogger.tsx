"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Prescription, PrescribedExercise } from "@/lib/training";
import { recordFeel, saveSet, setCompleted } from "@/app/patrol/actions";
import { ImpactBurst } from "./ImpactBurst";
import { HoldTimer } from "./HoldTimer";
import { MovementBriefBody, type TreeContext } from "./MovementBrief";
import type { Movement } from "@/lib/movements";
import { primeSound } from "./holdSound";
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
  preview = false,
  briefs = {},
  feel = {},
}: {
  date: string;
  initialPrescription: Prescription;
  initialLogged: Logged;
  personalBests: PB;
  completed: boolean;
  initialRpe: number | null;
  initialNote: string | null;
  isDeload: boolean;
  /** The day has not arrived. Nothing is issued, stored, or logged. */
  preview?: boolean;
  /** Today's verdict per movement, so the question can show its own answer. */
  feel?: Record<string, "controlled" | "hard" | "pain">;
  /** The catalogue entry behind each movement, keyed by exercise key. */
  briefs?: Record<string, MovementBrief>;
}) {
  const router = useRouter();
  const [rx, setRx] = useState(initialPrescription);
  const [logged, setLogged] = useState<Logged>(initialLogged);
  const [done, setDone] = useState(completed);
  const [rpe, setRpe] = useState<number | null>(initialRpe);
  const [note, setNote] = useState(initialNote ?? "");
  const [burst, setBurst] = useState<{ x: number; y: number } | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  /** Which movement's explanation is open, by exercise key. */
  const [showing, setShowing] = useState<string | null>(null);
  const [, start] = useTransition();

  const isBaseline = initialPrescription.phase === 0;

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
    // Never for a day that has not arrived. Issuing a prescription writes it
    // down, and a session written down weeks early is a session frozen at the
    // level you were on the evening you happened to scroll ahead.
    if (preview) return;
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

  const brief = briefs[showing ?? ""] ?? null;

  // A day that has not arrived is read-only. There is nothing to log against
  // it, and a set saved under a future date would put a reading on the ladder
  // from a session nobody has done.
  if (preview) {
    return (
      <div className="flex flex-col gap-4">
        {brief ? <BriefSheet brief={brief} onClose={() => setShowing(null)} /> : null}
        <ul className="flex flex-col gap-2">
          {rx.exercises.map((ex) => (
            <li key={ex.key} className="panel flex items-start justify-between gap-3 p-3">
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="flex items-center gap-1.5">
                  <span className="display text-base text-ink">{ex.name}</span>
                  {briefs[ex.key] ? <InfoButton onClick={() => setShowing(ex.key)} name={ex.name} /> : null}
                </span>
                {ex.note ? <span className="text-xs leading-relaxed text-muted-dim">{ex.note}</span> : null}
              </div>
              <span className="label-xs shrink-0 tabular">
                {ex.sets} × {ex.metric === "time" ? `${ex.targetSeconds ?? "—"} s` : (ex.repRange ?? ex.targetReps ?? "—")}
                {ex.perSide ? " /side" : ""}
              </span>
            </li>
          ))}
        </ul>

        {rx.locked.length > 0 ? (
          <div className="panel flex flex-col gap-2 border-l-2 border-l-cobalt p-4">
            <p className="label-xs text-cobalt-lift">Not yet — {rx.locked.length} held back</p>
            <ul className="flex flex-col gap-2">
              {rx.locked.map((l) => (
                <li key={l.name} className="flex flex-col gap-0.5">
                  <span className="text-sm text-ink">{l.name}</span>
                  <span className="text-xs leading-relaxed text-muted">{l.why}</span>
                </li>
              ))}
            </ul>
            <p className="text-xs leading-relaxed text-muted-dim">
              Earn these between now and then and they are in this session when it arrives.
            </p>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <ImpactBurst at={burst} onDone={() => setBurst(null)} />
      {brief ? <BriefSheet brief={brief} onClose={() => setShowing(null)} /> : null}

      {/* ── Prescription source ── */}
      {/* Phase 0 has no prescription to argue with: the model is not consulted
          and there is nothing to re-suggest, so offering the button would be a
          control that does nothing. */}
      <div className="flex items-center justify-between gap-3">
        <p className="label-xs">
          {isBaseline
            ? "Measurement · record what you get"
            : suggesting
              ? "Adjusting to your history"
              : rx.source === "ai"
                ? "Adjusted from your last sessions"
                : "Plan baseline"}
        </p>
        {isBaseline ? null : (
          <button
            type="button"
            onClick={() => void fetchRx(true)}
            disabled={suggesting}
            className="label-xs underline disabled:opacity-40"
          >
            Re-suggest
          </button>
        )}
      </div>

      {isDeload ? (
        <div className="panel-hot p-3">
          <p className="text-sm text-ink">
            Low profile week — fewer rounds, roughly 70% load, nothing to failure.
          </p>
        </div>
      ) : null}

      {suggesting && rx.source === "plan" && !isBaseline ? (
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
              date={date}
              sets={setsFor(ex)}
              pb={personalBests[ex.key] ?? null}
              hasBrief={briefs[ex.key] !== undefined}
              storedFeel={feel[ex.key] ?? null}
              onExplain={() => setShowing(ex.key)}
              onSave={(i, v) => onSaveSet(ex, i, v)}
            />
          </li>
        ))}
      </ul>

      {/* Movements the plan named that the tree is holding back. Shown rather
          than silently missing — a session that quietly loses an exercise reads
          as a bug, and the reason is also the next thing to go and train. */}
      {rx.locked.length > 0 ? (
        <div className="panel flex flex-col gap-2 border-l-2 border-l-cobalt p-4">
          <p className="label-xs text-cobalt-lift">Not yet — {rx.locked.length} held back</p>
          <ul className="flex flex-col gap-2">
            {rx.locked.map((l) => (
              <li key={l.name} className="flex flex-col gap-0.5">
                <span className="text-sm text-ink">{l.name}</span>
                <span className="text-xs leading-relaxed text-muted">{l.why}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs leading-relaxed text-muted-dim">
            These appear in your patrols on their own, as soon as what they need is in your logs.
          </p>
        </div>
      ) : null}

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

/**
 * Whether one logged set counts towards mastering the movement.
 *
 * The same rule as `setClears` in lib/movements, which is the server's copy and
 * the authority — `npm run check` compares the two so they cannot drift apart
 * without the build saying so.
 */
function setCounts(bar: PrescribedExercise["bar"], s: LoggedSet | null): boolean {
  if (!bar || !s) return false;
  if (bar.kg !== undefined && (s.weightKg ?? 0) < bar.kg) return false;
  if (bar.reps !== undefined) return (s.reps ?? 0) >= bar.reps;
  if (bar.seconds !== undefined) return (s.seconds ?? 0) >= bar.seconds;
  return false;
}

/** The catalogue entry behind one movement, as the page hands it over. */
export interface MovementBrief {
  m: Movement;
  tree: TreeContext;
}

/**
 * The explanation, one tap from the set you are about to do.
 *
 * It has always existed — THE WEB has carried setup, execution, what goes
 * wrong, cues and what it trains since v1.2.0 — on a screen you would have to
 * leave the session to reach. Standing over a mat trying to remember which
 * shoulder the roll goes over is precisely when that page is worth reading and
 * precisely when you will not go and find it.
 */
function BriefSheet({ brief, onClose }: { brief: MovementBrief; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-40 flex flex-col justify-end bg-base/85 backdrop-blur-sm">
      <button type="button" onClick={onClose} aria-label="Close" className="flex-1" />
      <div className="pad-safe-b panel mx-auto flex max-h-[88dvh] w-full max-w-lg flex-col gap-4 overflow-y-auto border-t-2 border-t-crimson p-4">
        <div className="flex items-start justify-between gap-3">
          <h2 className="display min-w-0 text-xl leading-tight text-ink">{brief.m.name}</h2>
          <button type="button" onClick={onClose} className="label-xs shrink-0 underline">
            Close
          </button>
        </div>
        <MovementBriefBody m={brief.m} tree={brief.tree} />
      </div>
    </div>
  );
}

function InfoButton({ onClick, name }: { onClick: () => void; name: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`How to do ${name.toLowerCase()}`}
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-edge text-[0.65rem] text-cobalt-lift active:border-cobalt"
    >
      i
    </button>
  );
}

function ExerciseCard({
  ex,
  date,
  sets,
  pb,
  hasBrief,
  storedFeel,
  onExplain,
  onSave,
}: {
  ex: PrescribedExercise;
  date: string;
  sets: LoggedSet[];
  pb: { reps: number | null; weightKg: number | null; seconds: number | null } | null;
  hasBrief: boolean;
  /** What was already said about this movement today, if anything. */
  storedFeel: "controlled" | "hard" | "pain" | null;
  onExplain: () => void;
  onSave: (setIndex: number, v: { reps?: number | null; weightKg?: number | null; seconds?: number | null }) => void;
}) {
  const byIndex = new Map(sets.map((s) => [s.setIndex, s]));
  const allDone = sets.length >= ex.sets;
  const counting = sets.filter((s) => setCounts(ex.bar, s)).length;

  return (
    <div className={`panel flex flex-col gap-3 p-3 ${allDone ? "border-crimson-dim" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="flex items-center gap-1.5">
            <span className="display text-base text-ink">{ex.name}</span>
            {hasBrief ? <InfoButton onClick={onExplain} name={ex.name} /> : null}
          </span>
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
              name={ex.name}
              metric={ex.metric}
              logged={byIndex.get(i) ?? null}
              targetReps={ex.targetReps}
              targetSeconds={ex.targetSeconds}
              targetWeight={ex.targetWeightKg}
              perSide={ex.perSide}
              showWeight={ex.loaded || ex.bar?.kg !== undefined || byIndex.get(i)?.weightKg != null}
              counts={setCounts(ex.bar, byIndex.get(i) ?? null)}
              onSave={(v) => onSave(i, v)}
            />
          </li>
        ))}
      </ul>

      {/* ── What a set has to be to count ──
          THE WEB has always said this; the screen you are actually working on
          never did. Logging two reps of something that wants twelve looked
          exactly like progress. */}
      {ex.bar ? (
        <p className="label-xs">
          {counting >= ex.bar.sets ? (
            <span className="text-crimson">
              {counting}/{ex.bar.sets} sets counted — this session banks towards mastery
            </span>
          ) : (
            <>
              {counting}/{ex.bar.sets} sets at {ex.bar.label} · that is what banks a session
            </>
          )}
        </p>
      ) : null}

      {/* Every session, once the work is in — never before, because it is a
          question about something that has not happened yet. */}
      {sets.length > 0 ? <FeelCheck date={date} ex={ex} stored={storedFeel} /> : null}
    </div>
  );
}

const VERDICTS = [
  { key: "controlled", label: "Controlled", hint: "Felt solid" },
  { key: "hard", label: "Hard", hint: "But nothing wrong" },
  { key: "pain", label: "Something hurt", hint: "Joint, not muscle" },
] as const;

/**
 * How the movement felt, asked after every session rather than once ever.
 *
 * The app can see that you did eight reps. It cannot see that the form fell
 * apart on the sixth, and that is the thing that decides whether the next rung
 * should open.
 *
 * It used to appear only the first time you ever did something, on the
 * reasoning that a question asked every session stops being answered. That was
 * the wrong trade. This is the only signal in the app for *how hard* a movement
 * was rather than how much of it you did, and its value is almost entirely in
 * the trend — one reading says nothing, twenty say whether a rung is settling
 * or grinding you down. It also feeds the step-down: two painful days on a
 * movement drop it a level.
 *
 * The friction that worry was about is handled instead of avoided. One tap, no
 * blocking, nothing required to finish the session — and it shows what you
 * already said today, so a reload is not a second interrogation.
 */
function FeelCheck({
  date,
  ex,
  stored,
}: {
  date: string;
  ex: PrescribedExercise;
  stored: "controlled" | "hard" | "pain" | null;
}) {
  const [chosen, setChosen] = useState<string | null>(stored);
  const [, start] = useTransition();

  // Answered on the server for this day: the row is an upsert on
  // (date, exercise_key), so tapping again simply corrects it.
  const answered = chosen !== null;

  return (
    <div className="flex flex-col gap-2 border-t border-edge pt-3">
      <p className="label-xs">
        {answered
          ? "How it felt · tap to change"
          : ex.firstTime
            ? `First time on ${ex.name.toLowerCase()} — how did it feel?`
            : "How did that feel?"}
      </p>
      <div className="grid grid-cols-3 gap-2">
        {VERDICTS.map((v) => (
          <button
            key={v.key}
            type="button"
            onClick={() => {
              setChosen(v.key);
              if (navigator.vibrate) navigator.vibrate(6);
              start(async () => {
                await recordFeel(date, ex.key, v.key);
              });
            }}
            aria-pressed={chosen === v.key}
            className={`tap flex flex-col items-center justify-center gap-0.5 border px-2 py-2 ${
              chosen === v.key
                ? v.key === "pain"
                  ? "border-crimson bg-crimson/15 text-crimson"
                  : "border-cobalt bg-cobalt/15 text-cobalt-lift"
                : "border-edge text-muted"
            }`}
          >
            <span className="text-[0.7rem] leading-tight">{v.label}</span>
            <span className="text-[0.55rem] leading-tight text-muted-dim">{v.hint}</span>
          </button>
        ))}
      </div>
      {chosen === "pain" ? (
        <p className="text-xs leading-relaxed text-crimson">
          Logged. Say so once more on this movement and it steps back down a level until the one below is
          clean again.
        </p>
      ) : null}
    </div>
  );
}

function SetRow({
  index,
  name,
  metric,
  logged,
  targetReps,
  targetSeconds,
  targetWeight,
  perSide,
  showWeight,
  counts,
  onSave,
}: {
  index: number;
  name: string;
  metric: "reps" | "time";
  logged: LoggedSet | null;
  targetReps: number | null;
  targetSeconds: number | null;
  targetWeight: number | null;
  perSide: boolean;
  showWeight: boolean;
  /** This set cleared the movement's mastery bar. */
  counts: boolean;
  onSave: (v: { reps?: number | null; weightKg?: number | null; seconds?: number | null }) => void;
}) {
  const [primary, setPrimary] = useState(
    logged ? String((metric === "time" ? logged.seconds : logged.reps) ?? "") : "",
  );
  const [weight, setWeight] = useState(logged?.weightKg != null ? String(logged.weightKg) : "");
  const [weightOpen, setWeightOpen] = useState(showWeight);
  const [timing, setTiming] = useState(false);
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
      {timing ? (
        <HoldTimer
          name={name}
          target={targetSeconds}
          perSide={perSide}
          onCancel={() => setTiming(false)}
          onDone={(secs) => {
            setTiming(false);
            const p = String(secs);
            setPrimary(p);
            commit(p, weight);
          }}
        />
      ) : null}

      <button
        type="button"
        onClick={filled ? () => { setPrimary(""); setWeight(""); commit("", ""); } : fillTarget}
        aria-label={
          filled
            ? `Clear set ${index + 1}${counts ? " — counted towards mastery" : " — short of the mastery bar"}`
            : `Fill set ${index + 1} with target`
        }
        title={filled && !counts ? "Logged, but short of the bar for mastering this movement" : undefined}
        className={`flex h-9 w-9 shrink-0 items-center justify-center border text-xs ${
          filled
            ? counts
              ? "border-crimson bg-crimson/15 text-crimson"
              : "border-edge bg-panel-2 text-muted"
            : "border-edge text-muted-dim"
        }`}
      >
        {filled ? (counts ? "✓" : "·") : index + 1}
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

      {/* Timed movements get a clock. Holding a plank while watching a phone in
          your other hand is a worse plank, and reading a wall clock upside down
          in a handstand is not a thing anyone does. */}
      {metric === "time" ? (
        <button
          type="button"
          onClick={() => {
            // Synchronously, inside the tap. An AudioContext resumed anywhere
            // else stays suspended on iOS and every tone the timer plays is
            // dropped without an error.
            primeSound();
            setTiming(true);
          }}
          aria-label={`Time set ${index + 1}`}
          className="tap flex h-9 w-9 shrink-0 items-center justify-center border border-edge text-cobalt-lift active:border-cobalt"
        >
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden>
            <circle cx="12" cy="13.5" r="7.5" />
            <path d="M12 9.5v4.2l2.6 1.6M9.4 2.6h5.2M12 2.6v2.4" strokeLinecap="round" />
          </svg>
        </button>
      ) : null}

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
