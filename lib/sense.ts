import { addDays, daysBetween, todayISO } from "./dates";
import { CORRIDOR_TOLERANCE_KG, corridorTarget } from "./plan";
import {
  buildComposition,
  compositionSummary,
  rollingAverage,
  type HqStats,
  type WeightRow,
} from "./stats";

export interface Insight {
  key: string;
  tone: "neutral" | "warn" | "good";
  text: string;
  /** Higher wins when trimming to two. */
  priority: number;
}

/**
 * SENSE reads patterns out of the local database. No AI call — these are all
 * things a query can see.
 *
 * Phase 1 only has weight to work with. PATROL and FUEL insights (snacking
 * clusters by weekday, recurring skipped session types, protein consistently
 * short) attach here as those tables fill.
 *
 * Returns at most two. A wall of observations is nagging, and nagging gets an
 * app deleted in week three.
 */
export function computeInsights(stats: HqStats, rows: WeightRow[]): Insight[] {
  const out: Insight[] = [];
  const today = todayISO();

  // ── Phase 0: the corridor deliberately asks for nothing yet ──
  if (stats.phase.id === 0) {
    const left = stats.phase.endDay - stats.day + 1;
    out.push({
      key: "phase0",
      tone: "neutral",
      priority: 96,
      text: `Baseline phase — ${left} day${left === 1 ? "" : "s"} left. Eat as you normally would and log all of it, train at the bottom of every range, and stop short. The deficit starts after this.`,
    });
  }

  // ── Logging gaps ──
  if (rows.length > 0) {
    const last = rows[rows.length - 1];
    const gap = daysBetween(last.date, today);
    if (gap >= 3) {
      out.push({
        key: "gap",
        tone: "warn",
        priority: 95,
        text: `No reading for ${gap} days. The average needs feeding — a gap this long makes the line guesswork.`,
      });
    }
  }

  // ── Corridor drift, judged on the average and only once it's sustained ──
  if (stats.corridorState === "above" || stats.corridorState === "below") {
    let streak = 0;
    for (let d = stats.day; d >= 0; d--) {
      const date = addDays(stats.startDateISO, d);
      const avg = rollingAverage(rows, date);
      if (avg === null) break;
      if (Math.abs(avg - corridorTarget(d)) > CORRIDOR_TOLERANCE_KG) streak++;
      else break;
    }
    if (streak >= 5) {
      const above = stats.corridorState === "above";
      out.push({
        key: `corridor-${stats.corridorState}`,
        tone: above ? "warn" : "good",
        priority: 90,
        text: above
          ? `Average has been above the corridor for ${streak} days. Before cutting calories, check the tracking — it's the honest answer nine times out of ten.`
          : `Average has been below the corridor for ${streak} days. Don't speed up — faster loss is more muscle lost.`,
      });
    }
  }

  // ── Water-weight noise, so a bad morning doesn't read as failure ──
  if (stats.latest && stats.avg7 !== null) {
    const spread = stats.latest.weightKg - stats.avg7;
    if (Math.abs(spread) >= 1.2) {
      out.push({
        key: "noise",
        tone: "neutral",
        priority: 55,
        text: `Today's reading sits ${Math.abs(spread).toFixed(1)} kg ${spread > 0 ? "above" : "below"} your average. Daily weight swings up to 2 kg on water alone — only the average counts.`,
      });
    }
  }

  // ── What the weight loss is actually made of ──
  // Ranked above the corridor insights: being ahead of the line is a bad result
  // if the missing kilos came off the wrong tissue.
  const split = compositionSummary(buildComposition(rows));
  if (split !== null && split.fatShare !== null) {
    const share = Math.round(split.fatShare * 100);
    if (split.leanDeltaKg <= -1 && share < 70) {
      out.push({
        key: "lean-loss",
        tone: "warn",
        priority: 93,
        text: `Only ${share}% of the last ${split.spanDays} days' change came off as fat — lean mass is down ${Math.abs(split.leanDeltaKg).toFixed(1)} kg. Hit the protein target every day and slow the deficit before cutting it further.`,
      });
    } else if (share >= 85) {
      out.push({
        key: "fat-loss-clean",
        tone: "good",
        priority: 68,
        text: `${share}% of the last ${split.spanDays} days' change was fat, with lean mass ${split.leanDeltaKg >= 0 ? "up" : "down only"} ${Math.abs(split.leanDeltaKg).toFixed(1)} kg. That is the deficit doing exactly what it's for.`,
      });
    }
  }

  // ── Consistency worth naming ──
  if (rows.length >= 7) {
    let streak = 0;
    for (let d = 0; ; d++) {
      const date = addDays(today, -d);
      if (rows.some((r) => r.date === date)) streak++;
      else break;
    }
    if (streak >= 7) {
      out.push({
        key: "logstreak",
        tone: "good",
        priority: 70,
        text: `${streak} consecutive days logged. That consistency is what makes the average trustworthy.`,
      });
    }
  }

  return out.sort((a, b) => b.priority - a.priority).slice(0, 2);
}
