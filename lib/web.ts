/**
 * THE WEB — the skill tree, assembled for the screen.
 *
 * Everything here is derived from the logs on read. There is no unlock table and
 * no stored progress: a node's state is a question about what you have done, and
 * the answer changes the moment you log a set. That also means a restored backup
 * restores the tree, and correcting a mis-logged set corrects it too.
 */

import { sql } from "drizzle-orm";
import { db } from "./db";
import { exerciseLogs } from "./db/schema";
import { ownedKeys, gateExercise } from "./equipment";
import { getSettings } from "./settings";
import {
  FAMILY_BLURBS,
  FAMILY_LABELS,
  LADDER_FAMILIES,
  isMastered,
  ladder,
  masteryLabel,
  movementKey,
  type Movement,
  type MovementFamily,
  type Prerequisite,
} from "./movements";
import { lockedBy, standings, type Standing } from "./baseline";

export type NodeState =
  /** Cleared the bar. The tier above is open. */
  | "mastered"
  /** Prescribed now, or has been logged, but not yet at the bar. */
  | "current"
  /** Everything below is done and the gates are open — this is next. */
  | "available"
  /** A gate from another strand is closed. */
  | "locked"
  /** You own none of the kit it needs. */
  | "unequipped";

export interface WebNode {
  movement: Movement;
  state: NodeState;
  bestReps: number | null;
  bestSeconds: number | null;
  sets: number;
  lastDate: string | null;
  /** How far along the mastery bar, 0–1. */
  progress: number;
  /** Why it is locked, when it is. */
  gate: Prerequisite | null;
  /** What clears the tier below, shown on the node above it. */
  unlockedBy: string | null;
}

export interface WebStrand {
  family: MovementFamily;
  label: string;
  blurb: string;
  nodes: WebNode[];
  /** Index of the node you are currently working. */
  activeIndex: number;
  mastered: number;
  reached: number;
  standing: Standing | null;
}

export interface WebSummary {
  strands: WebStrand[];
  totalNodes: number;
  totalMastered: number;
  totalReached: number;
  /**
   * Movements you have unlocked but never done. Tier 0 is excluded: on a fresh
   * account everything is open, and calling that "newly unlocked" would be a
   * congratulation for having installed the app.
   */
  nextUp: WebNode[];
}

interface Best {
  bestReps: number | null;
  bestSeconds: number | null;
  sets: number;
  lastDate: string;
}

function bestsByKey(): Map<string, Best> {
  const rows = db
    .select({
      key: exerciseLogs.exerciseKey,
      bestReps: sql<number | null>`MAX(${exerciseLogs.reps})`,
      bestSeconds: sql<number | null>`MAX(${exerciseLogs.seconds})`,
      sets: sql<number>`COUNT(*)`,
      lastDate: sql<string>`MAX(${exerciseLogs.date})`,
    })
    .from(exerciseLogs)
    .groupBy(exerciseLogs.exerciseKey)
    .all();
  return new Map(rows.map((r) => [r.key, r]));
}

/** Every name a movement's logs could be under, including its past names. */
function keysFor(m: Movement): string[] {
  return [m.name, ...(m.aliases ?? [])].map(movementKey);
}

/**
 * Logs written under any of a movement's names, merged. Renaming a movement
 * would otherwise split its history in two and reset the node.
 */
function mergeBests(m: Movement, bests: Map<string, Best>): Best | null {
  const found = keysFor(m)
    .map((k) => bests.get(k))
    .filter((b): b is Best => b !== undefined);
  if (found.length === 0) return null;

  return found.reduce((a, b) => ({
    bestReps: Math.max(a.bestReps ?? 0, b.bestReps ?? 0) || null,
    bestSeconds: Math.max(a.bestSeconds ?? 0, b.bestSeconds ?? 0) || null,
    sets: a.sets + b.sets,
    lastDate: a.lastDate > b.lastDate ? a.lastDate : b.lastDate,
  }));
}

function fraction(m: Movement, best: Best | null): number {
  if (!best) return 0;
  if (m.masterAt.reps !== undefined) return Math.min(1, (best.bestReps ?? 0) / m.masterAt.reps);
  if (m.masterAt.seconds !== undefined) return Math.min(1, (best.bestSeconds ?? 0) / m.masterAt.seconds);
  return 0;
}

export function buildWeb(): WebSummary {
  const st = standings();
  const bests = bestsByKey();
  const owned = ownedKeys(getSettings().equipment);

  const strands: WebStrand[] = [];
  const nextUp: WebNode[] = [];

  for (const family of LADDER_FAMILIES) {
    const movements = ladder(family);
    if (movements.length === 0) continue;

    const standing = st.get(family) ?? null;
    const reachedTier = standing?.tier ?? 0;

    const nodes: WebNode[] = movements.map((m, i) => {
      const best = mergeBests(m, bests);
      const gate = lockedBy(m, st);
      const mastered = isMastered(m, best?.bestReps ?? null, best?.bestSeconds ?? null);

      // Equipment first: a locked node you could open by training is a
      // different message from one you could open by buying a pull-up bar.
      const usable = gateExercise(m.name, owned).allowed || (m.needs ?? []).length === 0;

      let state: NodeState;
      if (!usable) state = "unequipped";
      else if (mastered) state = "mastered";
      else if (gate) state = "locked";
      else if (best) state = "current";
      else if (i <= reachedTier) state = "available";
      else state = "locked";

      const node: WebNode = {
        movement: m,
        state,
        bestReps: best?.bestReps ?? null,
        bestSeconds: best?.bestSeconds ?? null,
        sets: best?.sets ?? 0,
        lastDate: best?.lastDate ?? null,
        progress: fraction(m, best),
        gate,
        unlockedBy:
          i > 0 ? `${masteryLabel(movements[i - 1])} of ${movements[i - 1].name.toLowerCase()}` : null,
      };

      if (state === "available" && !best && m.tier > 0) nextUp.push(node);
      return node;
    });

    strands.push({
      family,
      label: FAMILY_LABELS[family],
      blurb: FAMILY_BLURBS[family],
      nodes,
      activeIndex: Math.min(reachedTier, nodes.length - 1),
      mastered: nodes.filter((n) => n.state === "mastered").length,
      reached: nodes.filter((n) => n.sets > 0).length,
      standing,
    });
  }

  return {
    strands,
    totalNodes: strands.reduce((n, s) => n + s.nodes.length, 0),
    totalMastered: strands.reduce((n, s) => n + s.mastered, 0),
    totalReached: strands.reduce((n, s) => n + s.reached, 0),
    nextUp,
  };
}
