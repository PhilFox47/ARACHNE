"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  primeSound,
  releaseSound,
  setSoundEnabled,
  soundEnabled,
  soundLeadTick,
  soundStart,
  soundStop,
  soundTarget,
  soundTick,
  wakeSound,
} from "./holdSound";

/**
 * The clock for a hold, so a plank does not need a second device.
 *
 * Four decisions, all of them made by the fact that you are on the floor and
 * cannot look at the screen:
 *
 *   It counts up, not down.  The mastery bar rewards going past the target —
 *     that is the whole progression mechanism for a timed movement — and a
 *     countdown hides how far past you got. The target is drawn as a line the
 *     clock crosses instead.
 *
 *   It makes a noise.  You will not be watching this — that is the whole point,
 *     and a silent timer would be a stopwatch you have to stare at. A five
 *     second lead-in counts you in and a rising pair says the clock has
 *     started; a three-note chime says the target is cleared and you may come
 *     out of it; a tick every thirty seconds after that gives a max hold some
 *     shape. Every one of them also buzzes, because a phone can be on silent
 *     and iOS will not play Web Audio when it is.
 *
 *   Elapsed comes from the wall clock, never from counting intervals.  Phones
 *     throttle timers in a backgrounded tab and stop them on lock; a counter
 *     that adds 100 ms per tick would quietly under-report a long hold. Two
 *     timestamps cannot.
 *
 *   The whole screen is the stop button.  You are dropping out of a plank with
 *     shaking arms. A 44-pixel target is not a reasonable thing to ask for.
 */

/**
 * Seconds of lead-in, so you can get into position after tapping start.
 *
 * Five, not three. Three is enough to put a phone down; it is not enough to put
 * a phone down and get into a wall handstand, which is the case that decides
 * this number.
 */
const LEAD_IN = 5;

/** After the target is cleared, a short tick at this interval. */
const TICK_EVERY = 30;

function buzz(pattern: number | number[]) {
  if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(pattern);
}

/** mm:ss past a minute, plain seconds below it — a 40 s plank is not "0:40". */
export function formatHold(seconds: number): string {
  if (seconds < 60) return String(seconds);
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function HoldTimer({
  name,
  target,
  perSide,
  onDone,
  onCancel,
}: {
  name: string;
  /** The prescribed hold, or null for a max attempt. Drawn as the line to cross. */
  target: number | null;
  perSide: boolean;
  /** Called with whole seconds held. */
  onDone: (seconds: number) => void;
  onCancel: () => void;
}) {
  const [phase, setPhase] = useState<"lead" | "running">("lead");
  const [elapsed, setElapsed] = useState(0);
  const [lead, setLead] = useState(LEAD_IN);
  const [sound, setSound] = useState(true);

  // Read after mount rather than during render: localStorage does not exist on
  // the server, and guessing wrong would flip the icon on first paint.
  useEffect(() => setSound(soundEnabled()), []);

  const startedAt = useRef<number | null>(null);
  const lastBuzzed = useRef(0);
  const clearedAt = useRef<number | null>(null);

  // ── Lead-in ──
  // Driven off timestamps like the clock itself, and sounded only when the
  // whole second actually changes — a 1000 ms interval drifts, and a drifting
  // countdown either double-beeps on a number or skips one entirely.
  useEffect(() => {
    if (phase !== "lead") return;
    const from = Date.now();
    let spoken = LEAD_IN + 1;

    const id = window.setInterval(() => {
      const left = LEAD_IN - Math.floor((Date.now() - from) / 1000);
      if (left <= 0) {
        window.clearInterval(id);
        startedAt.current = Date.now();
        buzz([30, 60, 30]);
        soundStart();
        setPhase("running");
        return;
      }
      if (left < spoken) {
        spoken = left;
        setLead(left);
        buzz(15);
        soundLeadTick();
      }
    }, 60);
    return () => window.clearInterval(id);
  }, [phase]);

  // ── The clock ──
  // Two timestamps and a repaint. The interval only decides how often the
  // number on screen is refreshed; it never decides what the number is.
  useEffect(() => {
    if (phase !== "running") return;

    const tick = () => {
      if (startedAt.current === null) return;
      const secs = Math.floor((Date.now() - startedAt.current) / 1000);
      setElapsed(secs);

      if (target !== null && secs >= target && clearedAt.current === null) {
        clearedAt.current = secs;
        lastBuzzed.current = secs;
        // The signal to come out of it. Long, doubled and three notes rising —
        // everything after this point is profit rather than the requirement.
        buzz([120, 80, 120]);
        soundTarget();
      } else if (secs >= lastBuzzed.current + TICK_EVERY && (target === null || clearedAt.current !== null)) {
        lastBuzzed.current = secs;
        buzz(25);
        soundTick();
      }
    };

    const id = window.setInterval(tick, 200);
    // A phone that was locked mid-hold comes back with a stale number for up to
    // 200 ms otherwise, which is exactly the moment you are looking at it.
    const onVisible = () => tick();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [phase, target]);

  // ── Keep the screen on ──
  // Not supported everywhere, and not worth a word to the user when it isn't —
  // the clock is correct either way, you just have to wake the phone to read it.
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    let dropped = false;

    const request = async () => {
      try {
        const wl = (navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } }).wakeLock;
        if (!wl) return;
        const held = await wl.request("screen");
        if (dropped) void held.release();
        else lock = held;
      } catch {
        // Denied, or the tab lost focus first. Nothing to do about it.
      }
    };
    void request();

    // Android drops the lock when the screen turns off and does not give it
    // back on its own.
    const onVisible = () => {
      if (document.visibilityState === "visible") void request();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      dropped = true;
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release();
    };
  }, []);

  // ── Sound ──
  // The context was created and resumed by the tap that opened this, which is
  // the only moment a browser will allow it. All that is left is to bring it
  // back after the phone has been asleep, and to close it on the way out.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") wakeSound();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      releaseSound();
    };
  }, []);

  const stop = useCallback(() => {
    if (phase !== "running" || startedAt.current === null) {
      onCancel();
      return;
    }
    const secs = Math.max(1, Math.round((Date.now() - startedAt.current) / 1000));
    buzz([40, 40, 40]);
    soundStop();
    onDone(secs);
  }, [phase, onDone, onCancel]);

  const cleared = target !== null && elapsed >= target;
  const pct = target === null ? 0 : Math.min(100, (elapsed / target) * 100);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-base">
      <div className="pad-safe-t flex items-start justify-between gap-3 px-4 pt-3">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="label-xs">Holding</p>
          <p className="display truncate text-lg text-ink">{name}</p>
          <p className="label-xs">
            {target === null ? "Max hold — go to failure" : `Target ${formatHold(target)}`}
            {perSide ? " · per side" : ""}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => {
              const next = !sound;
              setSound(next);
              setSoundEnabled(next);
              if (next) {
                primeSound();
                soundLeadTick();
              }
            }}
            className="tap flex w-11 items-center justify-center text-muted active:text-crimson"
            aria-label={sound ? "Turn the timer sounds off" : "Turn the timer sounds on"}
            aria-pressed={sound}
          >
            <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
              <path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4Z" />
              {sound ? (
                <path d="M15.5 9.2a4 4 0 0 1 0 5.6M18 6.8a7.5 7.5 0 0 1 0 10.4" />
              ) : (
                <path d="M16 10l4.5 4.5M20.5 10L16 14.5" />
              )}
            </svg>
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="tap label-xs underline"
            aria-label="Cancel the timer without logging"
          >
            Cancel
          </button>
        </div>
      </div>

      {/* The whole middle is the stop button. You are dropping out of a plank
          with shaking arms; a small target would be a design that has never
          been used lying down. */}
      <button
        type="button"
        onClick={stop}
        aria-label={phase === "lead" ? "Cancel" : "Stop the timer and log this set"}
        className="flex flex-1 flex-col items-center justify-center gap-6 px-6 outline-none"
      >
        {phase === "lead" ? (
          <>
            <span className="numeral text-[7rem] text-cobalt-lift">{lead}</span>
            <span className="label-xs">Get into position</span>
          </>
        ) : (
          <>
            <span
              className={`numeral text-[7rem] tabular ${cleared ? "text-crimson-lift" : "text-ink"}`}
            >
              {formatHold(elapsed)}
            </span>

            {target !== null ? (
              <div className="flex w-full max-w-xs flex-col gap-2">
                <div className="relative h-1.5 w-full bg-panel-2">
                  <div
                    className={`absolute inset-y-0 left-0 transition-[width] ${cleared ? "bg-crimson" : "bg-cobalt"}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className="label-xs text-center">
                  {cleared
                    ? `Target cleared · ${formatHold(elapsed - target)} past it`
                    : `${formatHold(target - elapsed)} to the target`}
                </p>
              </div>
            ) : null}
          </>
        )}
      </button>

      <div className="pad-safe-b px-4 pb-4">
        <p className="border-l-2 border-l-crimson pl-3 text-sm leading-relaxed text-muted">
          {phase === "lead"
            ? "Get set — it beeps and starts on zero. Tap to cancel."
            : target === null
              ? "Tap anywhere to stop — the time goes straight into the set. It ticks every thirty seconds, so you know roughly where you are without looking."
              : `It chimes at ${formatHold(target)}, so you know when you may come out of it — keep going if you have more. Tap anywhere to stop and the time goes straight into the set.`}
        </p>
      </div>
    </div>
  );
}
