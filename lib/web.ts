/**
 * THE WEB — the skill tree, assembled for the screen.
 *
 * Everything here is derived from the logs on read. There is no unlock table and
 * no stored progress: a node's state is a question about what you have done, and
 * the answer changes the moment you log a set. That also means a restored backup
 * restores the tree, and correcting a mis-logged set corrects it too.
 */

import { ownedKeys, gateExercise } from "./equipment";
import { getSettings } from "./settings";
import {
  FAMILY_BLURBS,
  FAMILY_LABELS,
  GROUNDWORK_FAMILIES,
  LADDER_FAMILIES,
  groundwork,
  ladder,
  masterySessions,
  masterySets,
  masteryLabel,
  type Movement,
  type MovementFamily,
  type Prerequisite,
} from "./movements";
import { lockedBy, standings, type Standing } from "./baseline";
import { movementRecords, resetSummary, type MovementRecord, type ResetSummary } from "./skills";

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
  sessions: number;
  lastDate: string | null;
  /** Sessions where enough sets cleared the bar, and how many are wanted. */
  cleanSessions: number;
  needSessions: number;
  /** Best sets-in-one-session against the bar, and how many are wanted. */
  bestCleanSets: number;
  needSets: number;
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
  /** Lines drawn on the tree, newest first. Empty when nothing has been reset. */
  resets: ResetSummary[];
  /**
   * The always-open work, grouped by family.
   *
   * On THE WEB because every movement the plan can prescribe should be
   * explained somewhere, and a warm-up you have never seen described is a
   * warm-up done from the name alone. Not on a strand, because nothing here is
   * earned — that would be a lock on the thing you do before training.
   */
  groundwork: GroundworkGroup[];
  totalGroundwork: number;
}

export interface GroundworkGroup {
  family: MovementFamily;
  label: string;
  nodes: WebNode[];
}

export function buildWeb(): WebSummary {
  const st = standings();
  const records = movementRecords();
  const owned = ownedKeys(getSettings().equipment);

  const strands: WebStrand[] = [];
  const nextUp: WebNode[] = [];

  for (const family of LADDER_FAMILIES) {
    const movements = ladder(family);
    if (movements.length === 0) continue;

    const standing = st.get(family) ?? null;
    const reachedTier = standing?.tier ?? 0;

    const nodes: WebNode[] = movements.map((m, i) => {
      const rec: MovementRecord | undefined = records.get(m.name);
      const gate = lockedBy(m, st);

      // Equipment first: a locked node you could open by training is a
      // different message from one you could open by buying a pull-up bar.
      const usable = gateExercise(m.name, owned).allowed || (m.needs ?? []).length === 0;

      let state: NodeState;
      if (!usable) state = "unequipped";
      else if (rec?.mastered) state = "mastered";
      else if (gate) state = "locked";
      else if (rec) state = "current";
      else if (i <= reachedTier) state = "available";
      else state = "locked";

      const node: WebNode = {
        movement: m,
        state,
        bestReps: rec?.bestReps ?? null,
        bestSeconds: rec?.bestSeconds ?? null,
        sets: rec?.sets ?? 0,
        sessions: rec?.sessions ?? 0,
        lastDate: rec?.lastDate ?? null,
        cleanSessions: rec?.cleanSessions ?? 0,
        needSessions: masterySessions(m),
        bestCleanSets: rec?.bestCleanSets ?? 0,
        needSets: masterySets(m),
        progress: rec?.progress ?? 0,
        gate,
        unlockedBy:
          i > 0 ? `${masteryLabel(movements[i - 1])} of ${movements[i - 1].name.toLowerCase()}` : null,
      };

      if (state === "available" && !rec && m.tier > 0) nextUp.push(node);
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

  const groups: GroundworkGroup[] = GROUNDWORK_FAMILIES.map((family) => ({
    family,
    label: FAMILY_LABELS[family],
    nodes: groundwork(family).map((m) => {
      const rec = records.get(m.name);
      const usable = gateExercise(m.name, owned).allowed || (m.needs ?? []).length === 0;
      return {
        movement: m,
        // Never locked and never mastered: it is either something you own the
        // kit for or something you can do right now.
        state: usable ? "available" : "unequipped",
        bestReps: rec?.bestReps ?? null,
        bestSeconds: rec?.bestSeconds ?? null,
        sets: rec?.sets ?? 0,
        sessions: rec?.sessions ?? 0,
        lastDate: rec?.lastDate ?? null,
        cleanSessions: 0,
        needSessions: 0,
        bestCleanSets: 0,
        needSets: 0,
        progress: 0,
        gate: null,
        unlockedBy: null,
      } satisfies WebNode;
    }),
  })).filter((g) => g.nodes.length > 0);

  return {
    strands,
    totalNodes: strands.reduce((n, s) => n + s.nodes.length, 0),
    totalMastered: strands.reduce((n, s) => n + s.mastered, 0),
    totalReached: strands.reduce((n, s) => n + s.reached, 0),
    nextUp,
    resets: resetSummary(),
    groundwork: groups,
    totalGroundwork: groups.reduce((n, g) => n + g.nodes.length, 0),
  };
}
