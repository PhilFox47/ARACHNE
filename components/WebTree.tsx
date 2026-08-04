"use client";

import { useState, useTransition } from "react";
import type { NodeState, WebNode, WebStrand, WebSummary } from "@/lib/web";
import { FAMILY_LABELS, masteryLabel, setBarLabel, type MovementFamily } from "@/lib/movements";
import { resetSkills, undoReset } from "@/app/web/actions";
import { TensionLine } from "./TensionLine";

const STATE_LABEL: Record<NodeState, string> = {
  mastered: "Mastered",
  current: "Working",
  available: "Unlocked",
  locked: "Locked",
  unequipped: "Needs kit",
};

const STATE_CLASS: Record<NodeState, string> = {
  mastered: "border-crimson bg-crimson/20 text-ink",
  current: "border-crimson-dim bg-crimson/5 text-ink",
  available: "border-cobalt bg-cobalt/10 text-cobalt-lift",
  locked: "border-edge bg-panel-2 text-muted-dim",
  unequipped: "border-edge bg-panel-2 text-muted-dim",
};

const STATE_TEXT: Record<NodeState, string> = {
  mastered: "text-crimson",
  current: "text-ink",
  available: "text-cobalt-lift",
  locked: "text-muted-dim",
  unequipped: "text-muted-dim",
};

/**
 * THE WEB.
 *
 * One strand per movement family, each a chain of nodes from the version anyone
 * can do to the one the year is aiming at. A node's state is derived from your
 * logs, so the tree is a picture of what you have actually done rather than a
 * setting someone chose.
 *
 * The detail sheet is the point as much as the tree is: a movement you do not
 * understand is a movement you do badly, and the tier above is always harder to
 * do *correctly*, not just harder.
 */
export function WebTree({ web }: { web: WebSummary }) {
  const [open, setOpen] = useState<WebNode | null>(null);
  const [resetting, setResetting] = useState(false);
  const [pending, start] = useTransition();

  return (
    <div className="flex flex-col gap-5">
      <section className="panel halftone flex flex-col gap-3 p-4">
        <div className="flex items-end justify-between gap-4">
          <div className="flex flex-col gap-1">
            <p className="label-xs">Movements mastered</p>
            <p className="numeral text-5xl text-ink tabular">
              {web.totalMastered}
              <span className="ml-1 text-[0.35em] tracking-normal text-muted">/ {web.totalNodes}</span>
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <p className="label-xs">Touched</p>
            <p className="numeral text-2xl text-cobalt-lift tabular">{web.totalReached}</p>
          </div>
        </div>
        <TensionLine accent={web.totalMastered > 0} />
        <p className="text-sm leading-relaxed text-muted">
          Every strand starts with a version anyone can do and ends with the one the year is aiming at.
          A movement is mastered when you hold the bar across separate sessions, not once — and the
          next one opens then. Nothing here is unlocked by time.
        </p>
        <button
          type="button"
          onClick={() => setResetting(true)}
          className="tap self-start border border-edge px-3 py-1.5 text-xs text-muted"
        >
          Reset placement
        </button>
      </section>

      {web.resets.length > 0 ? (
        <section className="panel flex flex-col gap-2 border-l-2 border-l-cobalt p-4">
          <p className="label-xs text-cobalt-lift">Reading from a line you drew</p>
          <ul className="flex flex-col gap-2">
            {web.resets.map((r) => (
              <li key={r.family ?? "all"} className="flex items-center justify-between gap-3">
                <span className="text-sm text-ink">
                  {r.family === null ? "The whole web" : FAMILY_LABELS[r.family]}
                  <span className="text-muted-dim"> · from {r.since}</span>
                </span>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => start(() => void undoReset(r.family))}
                  className="tap shrink-0 text-xs text-cobalt-lift underline disabled:opacity-50"
                >
                  Undo
                </button>
              </li>
            ))}
          </ul>
          <p className="text-xs leading-relaxed text-muted-dim">
            Nothing was deleted. Every set is still in your history and still counts towards your
            streak — THE WEB just stops reading the ones before the line.
          </p>
        </section>
      ) : null}

      {web.nextUp.length > 0 ? (
        <section className="panel-hot flex flex-col gap-2 p-4">
          <p className="label-xs text-crimson">Unlocked, not yet done</p>
          <p className="text-sm leading-relaxed text-ink">
            {web.nextUp.length === 1
              ? `${web.nextUp[0].movement.name} opened up and you haven't done it yet.`
              : `${web.nextUp.length} movements have opened up and you haven't done them yet.`}
          </p>
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
            {web.nextUp.map((n) => (
              <button
                key={n.movement.name}
                type="button"
                onClick={() => setOpen(n)}
                className="tap shrink-0 border border-cobalt px-3 py-1.5 text-xs text-cobalt-lift"
              >
                {n.movement.name}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {web.strands.map((s) => (
        <Strand key={s.family} strand={s} onOpen={setOpen} />
      ))}

      {web.groundwork.length > 0 ? <Groundwork web={web} onOpen={setOpen} /> : null}

      {open ? <Sheet node={open} onClose={() => setOpen(null)} /> : null}
      {resetting ? <ResetSheet web={web} onClose={() => setResetting(false)} /> : null}
    </div>
  );
}

/**
 * Resetting placement.
 *
 * The case this exists for: your first patrol went in before the ladder knew
 * anything about you, so a strand opened halfway up on the strength of one set
 * of an exercise you had never done before. That is not a data-entry mistake —
 * the set happened — so deleting it would be the wrong repair. What you want is
 * for the tree to stop treating it as a reading.
 *
 * Strand by strand rather than all-or-nothing, because the problem is usually
 * two strands and not twelve, and one confirm rather than two because nothing
 * here is destroyed and there is an Undo sitting on the screen afterwards.
 */
function ResetSheet({ web, onClose }: { web: WebSummary; onClose: () => void }) {
  const [picked, setPicked] = useState<Set<MovementFamily>>(new Set());
  const [everything, setEverything] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();

  const touched = web.strands.filter((s) => s.reached > 0);
  const count = everything ? touched.length : picked.size;

  const toggle = (family: MovementFamily) => {
    setConfirming(false);
    setEverything(false);
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(family)) next.delete(family);
      else next.add(family);
      return next;
    });
  };

  const submit = () => {
    start(async () => {
      if (everything) await resetSkills(null);
      else for (const family of picked) await resetSkills(family);
      onClose();
    });
  };

  return (
    <div className="fixed inset-0 z-40 flex flex-col justify-end bg-base/85 backdrop-blur-sm">
      <button type="button" onClick={onClose} aria-label="Close" className="flex-1" />

      <div className="pad-safe-b panel mx-auto flex max-h-[88dvh] w-full max-w-lg flex-col gap-4 overflow-y-auto border-t-2 border-t-cobalt p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <p className="label-xs text-cobalt-lift">Reset placement</p>
            <h2 className="display text-xl leading-tight text-ink">Draw a line</h2>
          </div>
          <button type="button" onClick={onClose} className="label-xs shrink-0 underline">
            Close
          </button>
        </div>

        <p className="text-sm leading-relaxed text-muted">
          Sets logged before now stop counting towards THE WEB, and the strands you pick start again
          from the bottom. Nothing is deleted — your patrols, your streak and every number stay
          exactly as they are, and you can undo this afterwards.
        </p>

        <button
          type="button"
          onClick={() => {
            setConfirming(false);
            setPicked(new Set());
            setEverything((v) => !v);
          }}
          className={`tap flex items-center justify-between gap-3 border p-3 text-left ${
            everything ? "border-crimson bg-crimson/10" : "border-edge"
          }`}
        >
          <span className="flex flex-col gap-0.5">
            <span className="text-sm text-ink">The whole web</span>
            <span className="label-xs">All twelve strands back to the bottom</span>
          </span>
          <span className={`text-sm ${everything ? "text-crimson" : "text-muted-dim"}`}>
            {everything ? "✓" : "○"}
          </span>
        </button>

        <div className="flex flex-col gap-2">
          <p className="label-xs">Or just these strands</p>
          {touched.length === 0 ? (
            <p className="text-xs leading-relaxed text-muted-dim">
              Nothing is logged yet, so there is nothing to reset.
            </p>
          ) : (
            <ul className="panel divide-y divide-edge">
              {touched.map((s) => (
                <li key={s.family}>
                  <button
                    type="button"
                    onClick={() => toggle(s.family)}
                    className="tap flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
                  >
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="text-sm text-ink">{s.label}</span>
                      <span className="label-xs truncate">
                        Level {s.activeIndex + 1} of {s.nodes.length} ·{" "}
                        {s.nodes[s.activeIndex]?.movement.name.toLowerCase()}
                      </span>
                    </span>
                    <span
                      className={`shrink-0 text-sm ${
                        picked.has(s.family) ? "text-crimson" : "text-muted-dim"
                      }`}
                    >
                      {picked.has(s.family) ? "✓" : "○"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {confirming ? (
          <div className="panel-hot flex flex-col gap-3 p-3">
            <p className="text-sm leading-relaxed text-ink">
              {everything
                ? "Every strand goes back to its easiest movement."
                : count === 1
                  ? `${web.strands.find((s) => picked.has(s.family))?.label} goes back to its easiest movement.`
                  : `${count} strands go back to their easiest movement.`}{" "}
              Your next patrol will open there.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={submit}
                className="tap flex-1 border border-crimson bg-crimson/20 px-3 py-2.5 text-sm text-ink disabled:opacity-50"
              >
                {pending ? "Resetting…" : "Yes, reset"}
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="tap border border-edge px-3 py-2.5 text-sm text-muted"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            disabled={count === 0}
            onClick={() => setConfirming(true)}
            className="tap border border-crimson px-3 py-2.5 text-sm text-crimson disabled:border-edge disabled:text-muted-dim"
          >
            {count === 0
              ? "Pick what to reset"
              : everything
                ? "Reset the whole web"
                : `Reset ${count} ${count === 1 ? "strand" : "strands"}`}
          </button>
        )}
      </div>
    </div>
  );
}

/** Your best single set, in whichever unit the movement is measured in. */
function bestOf(n: WebNode): string {
  const timed = n.movement.masterAt.seconds !== undefined;
  const best = timed ? n.bestSeconds : n.bestReps;
  if (best === null) return "—";
  return timed ? `${best} s` : `${best} reps`;
}

/**
 * One line under the name, and it has to fit. The full story is a tap away, so
 * this says only the thing you came to the list to find out: how far along, or
 * what is in the way.
 *
 * Which number counts as "how far along" changes with where you are. Before a
 * single clean session the useful figure is how many sets in your best session
 * cleared the bar; after one it is sessions, because that is the part still
 * outstanding.
 */
function subtitle(n: WebNode): string {
  if (n.state === "unequipped") return "Needs kit you don't own";
  if (n.state === "locked") return n.gate ? `Needs ${FAMILY_LABELS[n.gate.family].toLowerCase()} first` : "Clear the level below";
  if (n.state === "mastered") return `Mastered · ${bestOf(n)}`;
  if (n.sets === 0) return `${masteryLabel(n.movement)} to master`;
  if (n.cleanSessions > 0) return `${n.cleanSessions}/${n.needSessions} clean sessions · ${bestOf(n)}`;
  return `${n.bestCleanSets}/${n.needSets} sets clean · ${bestOf(n)}`;
}

function Strand({ strand, onOpen }: { strand: WebStrand; onOpen: (n: WebNode) => void }) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <p className="label-xs">{strand.label}</p>
        <p className="label-xs tabular">
          {strand.mastered} / {strand.nodes.length}
        </p>
      </div>
      <p className="px-1 text-xs leading-relaxed text-muted-dim">{strand.blurb}</p>

      <ul className="panel divide-y divide-edge">
        {strand.nodes.map((n, i) => (
          <li key={n.movement.name}>
            <button
              type="button"
              onClick={() => onOpen(n)}
              className="tap flex w-full items-center gap-3 px-3 py-2.5 text-left"
            >
              {/* The strand itself — a line down the left with a node on it. */}
              <span className="relative flex w-7 shrink-0 flex-col items-center self-stretch">
                {i > 0 ? (
                  <span
                    className={`absolute -top-2.5 h-3 w-px ${
                      n.state === "locked" || n.state === "unequipped" ? "bg-edge" : "bg-crimson-dim"
                    }`}
                  />
                ) : null}
                <span
                  className={`flex h-7 w-7 items-center justify-center border text-[0.6rem] ${STATE_CLASS[n.state]}`}
                >
                  {n.state === "mastered" ? "✓" : n.state === "unequipped" ? "—" : i + 1}
                </span>
                {i < strand.nodes.length - 1 ? (
                  <span
                    className={`absolute -bottom-2.5 h-3 w-px ${
                      strand.nodes[i + 1].state === "locked" || strand.nodes[i + 1].state === "unequipped"
                        ? "bg-edge"
                        : "bg-crimson-dim"
                    }`}
                  />
                ) : null}
              </span>

              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className={`text-sm ${STATE_TEXT[n.state]}`}>{n.movement.name}</span>
                <span className="label-xs truncate">{subtitle(n)}</span>
                {n.progress > 0 && n.state !== "mastered" ? (
                  <span className="h-0.5 w-full bg-panel-2">
                    <span
                      className="block h-full bg-crimson"
                      style={{ width: `${Math.round(n.progress * 100)}%` }}
                    />
                  </span>
                ) : null}
              </span>

              <span className="label-xs shrink-0">{STATE_LABEL[n.state]}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * The work that is always there.
 *
 * It is on this screen for one reason: every movement a patrol can put in front
 * of you should be explained somewhere, and warm-ups were the half of the plan
 * that never was. It is deliberately not a strand — arm circles do not unlock
 * cat-cow, and drawing them as a chain would say they did.
 */
function Groundwork({ web, onOpen }: { web: WebSummary; onOpen: (n: WebNode) => void }) {
  const [open, setOpen] = useState(false);

  return (
    <section className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="tap flex items-baseline justify-between gap-3 text-left"
      >
        <p className="label-xs">Groundwork</p>
        <p className="label-xs tabular">
          {web.totalGroundwork} {open ? "▲" : "▼"}
        </p>
      </button>
      <p className="px-1 text-xs leading-relaxed text-muted-dim">
        Warm-ups, cooldowns, the mobility drills and the dumbbell work. Always open, nothing to
        unlock — but explained, because you do these more often than anything on a strand.
      </p>

      {open
        ? web.groundwork.map((g) => (
            <div key={g.family} className="flex flex-col gap-1.5">
              <p className="label-xs px-1 pt-2 text-cobalt-lift">{g.label}</p>
              <ul className="panel divide-y divide-edge">
                {g.nodes.map((n) => (
                  <li key={n.movement.name}>
                    <button
                      type="button"
                      onClick={() => onOpen(n)}
                      className="tap flex w-full items-center gap-3 px-3 py-2.5 text-left"
                    >
                      <span className="flex min-w-0 flex-1 flex-col gap-1">
                        <span
                          className={`text-sm ${
                            n.state === "unequipped" ? "text-muted-dim" : "text-ink"
                          }`}
                        >
                          {n.movement.name}
                        </span>
                        <span className="label-xs truncate">
                          {n.state === "unequipped" ? "Needs kit you don't own" : n.movement.dose}
                        </span>
                      </span>
                      <span className="label-xs shrink-0">
                        {n.sets > 0 ? `${n.sets} sets` : "—"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))
        : null}
    </section>
  );
}

/** The coaching detail. Long on purpose — this is where the movement is learned. */
function Sheet({ node, onClose }: { node: WebNode; onClose: () => void }) {
  const m = node.movement;
  const isGround = m.track === "groundwork";

  return (
    <div className="fixed inset-0 z-40 flex flex-col justify-end bg-base/85 backdrop-blur-sm">
      <button type="button" onClick={onClose} aria-label="Close" className="flex-1" />

      <div className="pad-safe-b panel mx-auto flex max-h-[88dvh] w-full max-w-lg flex-col gap-4 overflow-y-auto border-t-2 border-t-crimson p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <p className="label-xs text-crimson">
              {isGround ? "Groundwork" : STATE_LABEL[node.state]}
            </p>
            <h2 className="display text-xl leading-tight text-ink">{m.name}</h2>
          </div>
          <button type="button" onClick={onClose} className="label-xs shrink-0 underline">
            Close
          </button>
        </div>

        <p className="text-sm leading-relaxed text-muted">{m.summary}</p>

        {node.sets > 0 ? (
          <div className="grid grid-cols-3 border border-edge">
            <Cell
              label="Your best"
              value={
                m.metric === "time" ? `${node.bestSeconds ?? "—"}s` : String(node.bestReps ?? "—")
              }
            />
            {isGround ? (
              <Cell label="Sessions" value={String(node.sessions)} bordered />
            ) : (
              <Cell
                label="Clean sessions"
                value={`${node.cleanSessions} / ${node.needSessions}`}
                bordered
              />
            )}
            <Cell label="Sets logged" value={String(node.sets)} bordered />
          </div>
        ) : null}

        {isGround ? (
          <div className="flex flex-col gap-1.5 border-l-2 border-l-cobalt pl-3">
            <p className="label-xs text-cobalt-lift">Groundwork · {m.dose}</p>
            <p className="text-xs leading-relaxed text-muted">
              Always available and never locked. There is nothing to master here — this is what you
              do so the rest of the session goes well, and the only thing that matters is doing it
              properly.
            </p>
          </div>
        ) : (
          /* The rule, spelled out. A bar you can clear by accident on one good day
             teaches nothing, and it is worth saying why the app is holding you here. */
          <div className="flex flex-col gap-1.5 border-l-2 border-l-cobalt pl-3">
            <p className="label-xs text-cobalt-lift">Mastered at {masteryLabel(m)}</p>
            <p className="text-xs leading-relaxed text-muted">
              {node.needSets} sets that clear {setBarLabel(m)} in one session, on {node.needSessions}{" "}
              separate days. One good set is a good day, not a level — and a session where you
              reported that something hurt doesn&apos;t count towards it.
              {node.sets > 0 && node.state !== "mastered" && node.cleanSessions === 0
                ? ` Your best session so far cleared ${node.bestCleanSets} of ${node.needSets}.`
                : ""}
            </p>
          </div>
        )}

        {node.state === "locked" && node.gate ? (
          <div className="panel-hot flex flex-col gap-1 p-3">
            <p className="label-xs text-crimson">Locked</p>
            <p className="text-sm leading-relaxed text-ink">{node.gate.why}</p>
          </div>
        ) : node.state === "locked" && node.unlockedBy ? (
          <div className="panel-hot flex flex-col gap-1 p-3">
            <p className="label-xs text-crimson">Locked</p>
            <p className="text-sm leading-relaxed text-ink">Opens at {node.unlockedBy}.</p>
          </div>
        ) : node.state === "unequipped" ? (
          <div className="panel-hot flex flex-col gap-1 p-3">
            <p className="label-xs text-crimson">Needs kit</p>
            <p className="text-sm leading-relaxed text-ink">
              You own none of what this takes. Add it under SETTINGS → Training materials and it appears in
              your patrols.
            </p>
          </div>
        ) : null}

        <Block title="Setting up" items={m.setup} />
        <Block title="The rep" items={m.execution} />

        <div className="flex flex-col gap-1.5">
          <p className="label-xs text-crimson">What goes wrong</p>
          <p className="border-l-2 border-l-crimson pl-3 text-sm leading-relaxed text-muted">{m.watch}</p>
        </div>

        <div className="flex flex-col gap-2">
          <p className="label-xs">Cues</p>
          <div className="flex flex-wrap gap-2">
            {m.cues.map((c) => (
              <span key={c} className="border border-edge px-2.5 py-1 text-xs text-ink">
                {c}
              </span>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <p className="label-xs">Trains</p>
          <div className="flex flex-wrap gap-2">
            {m.trains.map((t) => (
              <span key={t} className="border border-cobalt/40 px-2.5 py-1 text-xs text-cobalt-lift">
                {t}
              </span>
            ))}
          </div>
        </div>

        {m.requires && m.requires.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            <p className="label-xs">Needs from elsewhere</p>
            {m.requires.map((r) => (
              <p key={r.family} className="text-xs leading-relaxed text-muted-dim">
                {r.why}
              </p>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Block({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="label-xs">{title}</p>
      <ol className="flex flex-col gap-1.5">
        {items.map((s, i) => (
          <li key={s} className="flex gap-2.5">
            <span className="numeral shrink-0 text-xs text-crimson tabular">{i + 1}</span>
            <span className="text-sm leading-relaxed text-muted">{s}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Cell({ label, value, bordered }: { label: string; value: string; bordered?: boolean }) {
  return (
    <div className={`flex flex-col gap-1 p-2.5 ${bordered ? "border-l border-edge" : ""}`}>
      <span className="numeral text-lg text-ink tabular">{value}</span>
      <span className="label-xs leading-tight">{label}</span>
    </div>
  );
}
