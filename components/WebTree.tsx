"use client";

import { useState } from "react";
import type { NodeState, WebNode, WebStrand, WebSummary } from "@/lib/web";
import { FAMILY_LABELS, masteryLabel } from "@/lib/movements";
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
          Clear the bar on a movement and the next one opens — nothing here is unlocked by time.
        </p>
      </section>

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

      {open ? <Sheet node={open} onClose={() => setOpen(null)} /> : null}
    </div>
  );
}

/**
 * One line under the name, and it has to fit. The full story is a tap away, so
 * this says only the thing you came to the list to find out: how far along, or
 * what is in the way.
 */
function subtitle(n: WebNode): string {
  if (n.state === "unequipped") return "Needs kit you don't own";
  if (n.state === "locked") return n.gate ? `Needs ${FAMILY_LABELS[n.gate.family].toLowerCase()} first` : "Clear the level below";

  const bar = n.movement.masterAt.reps ?? n.movement.masterAt.seconds ?? 0;
  const unit = n.movement.masterAt.seconds !== undefined ? " s" : " reps";
  const best = n.movement.masterAt.seconds !== undefined ? n.bestSeconds : n.bestReps;
  return n.sets > 0 ? `${best ?? 0} of ${bar}${unit}` : `${bar}${unit} to master`;
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

/** The coaching detail. Long on purpose — this is where the movement is learned. */
function Sheet({ node, onClose }: { node: WebNode; onClose: () => void }) {
  const m = node.movement;

  return (
    <div className="fixed inset-0 z-40 flex flex-col justify-end bg-base/85 backdrop-blur-sm">
      <button type="button" onClick={onClose} aria-label="Close" className="flex-1" />

      <div className="pad-safe-b panel mx-auto flex max-h-[88dvh] w-full max-w-lg flex-col gap-4 overflow-y-auto border-t-2 border-t-crimson p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <p className="label-xs text-crimson">{STATE_LABEL[node.state]}</p>
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
            <Cell label="To master" value={masteryLabel(m)} bordered />
            <Cell label="Sets logged" value={String(node.sets)} bordered />
          </div>
        ) : null}

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
