import { todayISO } from "./dates";
import { BRIEFING_HOUR, briefingDue, ensureBriefing, storedBriefing, upgradable } from "./briefing";

/**
 * Writes the briefing at 08:00, and catches up if the server was not running.
 *
 * A cron would be the obvious answer and is the wrong shape here: this is a
 * single container that gets restarted, and anything living outside the process
 * is another thing to install, another thing to forget, and another way for the
 * app to be half-configured. A poll inside the server needs nothing.
 *
 * Armed from the root layout rather than from `instrumentation.ts`, which is
 * where this belongs and cannot go: the app ships middleware, so Next compiles
 * instrumentation for the edge runtime as well, and better-sqlite3 cannot be
 * bundled for a runtime with no `fs`. A runtime guard does not help — webpack
 * has already had to resolve the import by then. The layout runs on the first
 * request after boot instead, which in a container that has been up since
 * yesterday means the timer is armed long before 08:00.
 *
 * The poll rather than a single timer aimed at 08:00 is deliberate. `setTimeout`
 * to a wall-clock hour is wrong across a suspend, a daylight-saving change or a
 * container that was asleep at 08:00, and all three are ordinary here. Asking
 * "is one due and missing?" every few minutes is correct in all of them, and
 * the question is one indexed row.
 *
 * The work is idempotent — `ensureBriefing` upserts on the date — so a race
 * with a page load costs one wasted call and never a second paragraph.
 */

const POLL_MINUTES = 5;

const g = globalThis as unknown as { __arachneBriefingTimer?: NodeJS.Timeout };

async function tick() {
  try {
    const date = todayISO();
    const existing = storedBriefing(date);
    if (existing && !upgradable(existing)) return;
    if (!existing && !briefingDue(date)) return;
    await ensureBriefing(date);
  } catch {
    // A briefing is not worth crashing a server over. The page-load path is
    // still there, and the next tick tries again.
  }
}

export function startBriefingSchedule() {
  // Next's dev server re-runs instrumentation on reload; without the global
  // each reload leaves another interval behind, and by lunchtime the model is
  // being asked twenty times an hour.
  if (g.__arachneBriefingTimer) return;

  const timer = setInterval(() => void tick(), POLL_MINUTES * 60 * 1000);
  // Never hold the process open on this alone.
  timer.unref?.();
  g.__arachneBriefingTimer = timer;

  // And once now, for the restart that happened at 09:00 with nothing written.
  void tick();

  console.log(`[arachne] briefing schedule armed — due from ${BRIEFING_HOUR}:00, checked every ${POLL_MINUTES} min`);
}

export function stopBriefingSchedule() {
  if (!g.__arachneBriefingTimer) return;
  clearInterval(g.__arachneBriefingTimer);
  g.__arachneBriefingTimer = undefined;
}
