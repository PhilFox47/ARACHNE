"use client";

import { useEffect, useState } from "react";

/**
 * The one celebratory animation in the app. Impact lines radiate from the tap
 * point, then it's gone in 600ms.
 *
 * Restraint is the point: if this fired on every save it would stop meaning
 * anything by week three, so nothing else in ARACHNE uses it.
 */
export function ImpactBurst({ at, onDone }: { at: { x: number; y: number } | null; onDone: () => void }) {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  useEffect(() => {
    if (!at) return;
    const t = setTimeout(onDone, reduced ? 0 : 620);
    return () => clearTimeout(t);
  }, [at, onDone, reduced]);

  if (!at || reduced) return null;

  const lines = Array.from({ length: 14 }, (_, i) => {
    const angle = (i / 14) * Math.PI * 2 + (i % 2 ? 0.11 : 0);
    const inner = 16 + (i % 3) * 7;
    const outer = inner + 46 + (i % 4) * 22;
    return {
      x1: Math.cos(angle) * inner,
      y1: Math.sin(angle) * inner,
      x2: Math.cos(angle) * outer,
      y2: Math.sin(angle) * outer,
      w: i % 3 === 0 ? 3 : 1.6,
      delay: (i % 5) * 18,
    };
  });

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-50"
      style={{ contain: "strict" }}
    >
      <svg
        className="absolute overflow-visible"
        style={{ left: at.x, top: at.y, width: 1, height: 1 }}
      >
        {lines.map((l, i) => (
          <line
            key={i}
            x1={l.x1}
            y1={l.y1}
            x2={l.x2}
            y2={l.y2}
            stroke={i % 3 === 0 ? "#D42A3F" : "#4E86E8"}
            strokeWidth={l.w}
            strokeLinecap="round"
            style={{
              transformOrigin: "0 0",
              animation: `impact-line 560ms cubic-bezier(.15,.75,.3,1) ${l.delay}ms forwards`,
            }}
          />
        ))}
        <circle
          cx={0}
          cy={0}
          r={10}
          fill="none"
          stroke="#D42A3F"
          strokeWidth={3}
          style={{ transformOrigin: "0 0", animation: "impact-ring 560ms cubic-bezier(.15,.75,.3,1) forwards" }}
        />
      </svg>
    </div>
  );
}
