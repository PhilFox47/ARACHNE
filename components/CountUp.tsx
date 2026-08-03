"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Counts up on mount — ~400ms, once. Deliberately not re-triggered on re-render:
 * a number that re-animates every time its parent updates is exactly the kind of
 * thing that stops being satisfying around the 200th use.
 */
export function CountUp({
  value,
  decimals = 1,
  signed = false,
  suffix,
  className,
  duration = 420,
}: {
  value: number | null;
  decimals?: number;
  signed?: boolean;
  suffix?: string;
  className?: string;
  duration?: number;
}) {
  const [shown, setShown] = useState(value === null ? null : 0);
  const done = useRef(false);

  useEffect(() => {
    if (value === null) {
      setShown(null);
      return;
    }
    if (done.current) {
      setShown(value);
      return;
    }
    done.current = true;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(value);
      return;
    }

    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setShown(value * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  if (shown === null) {
    // Scaled down relative to the parent: an em-dash at the hero size renders
    // as a solid white bar, which reads as a broken layout rather than "no data".
    return (
      <span className={className}>
        <span className="text-[0.4em] text-muted-dim">&mdash;</span>
      </span>
    );
  }

  const body = shown.toFixed(decimals);
  const sign = signed && shown > 0 ? "+" : "";

  return (
    <span className={className}>
      {sign}
      {body}
      {suffix ? <span className="ml-1 text-[0.32em] tracking-normal text-muted">{suffix}</span> : null}
    </span>
  );
}
