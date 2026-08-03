"use client";

import { useEffect, useRef } from "react";

/**
 * Background texture: a radial web lattice anchored off the top-right corner, so
 * it reads as a fragment of something much larger rather than a centred
 * medallion. Fixed rather than scrolling — it should feel like an etched
 * surface, not wallpaper sliding under the data.
 *
 * Drawn once per resize. No animation, nothing per-frame.
 */
export function WebLattice() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;

    const draw = () => {
      const w = cv.clientWidth;
      const h = cv.clientHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      cv.width = w * dpr;
      cv.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const ax = w * 1.04;
      const ay = -h * 0.06;
      const spokes = 15;
      const rings = 13;
      const maxR = Math.hypot(w * 1.3, h * 1.3);
      const a0 = Math.PI * 0.52;
      const a1 = Math.PI * 1.06;
      const angleAt = (i: number) => a0 + (a1 - a0) * (i / (spokes - 1));

      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(139,150,180,0.10)";
      for (let s = 0; s < spokes; s++) {
        const a = angleAt(s);
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(ax + Math.cos(a) * maxR, ay + Math.sin(a) * maxR);
        ctx.stroke();
      }

      for (let r = 1; r <= rings; r++) {
        // Non-linear spacing: rings crowd toward the anchor like a real web.
        const rad = maxR * Math.pow(r / rings, 1.45);
        ctx.beginPath();
        for (let s = 0; s < spokes; s++) {
          const a = angleAt(s);
          const px = ax + Math.cos(a) * rad;
          const py = ay + Math.sin(a) * rad;
          if (s === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.strokeStyle = "rgba(139,150,180,0.085)";
        ctx.stroke();

        ctx.fillStyle = "rgba(139,150,180,0.16)";
        for (let s = 0; s < spokes; s++) {
          const a = angleAt(s);
          ctx.beginPath();
          ctx.arc(ax + Math.cos(a) * rad, ay + Math.sin(a) * rad, 1.15, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    };

    draw();
    let t: ReturnType<typeof setTimeout>;
    const onResize = () => {
      clearTimeout(t);
      t = setTimeout(draw, 160);
    };
    window.addEventListener("resize", onResize);
    return () => {
      clearTimeout(t);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 h-full w-full"
    />
  );
}
