"use client";

import { useEffect, useState } from "react";

export interface Viewport {
  /** Height of the area actually on screen — the window minus the keyboard. */
  height: number;
  /** How far the visible area has been pushed down the layout viewport. */
  offsetTop: number;
  /** True once real numbers have arrived. Before that, don't override CSS. */
  ready: boolean;
}

/**
 * The part of the window a phone is actually showing.
 *
 * `100dvh` is the usual answer and it is only half of one: Chrome on Android
 * shrinks the dynamic viewport when the keyboard opens, and iOS Safari does not.
 * There the layout viewport stays full height and only the *visual* viewport
 * shrinks, so anything sized in dvh sits calmly underneath the keyboard.
 *
 * `visualViewport` reports the truth on both. It is read rather than assumed
 * because the keyboard's height is not knowable any other way — it differs by
 * device, by language, and by whether a suggestion strip is showing.
 */
export function useVisualViewport(): Viewport {
  const [vp, setVp] = useState<Viewport>({ height: 0, offsetTop: 0, ready: false });

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) {
      // Older browsers: the window is the best available answer, and it is the
      // one CSS would have used anyway.
      setVp({ height: window.innerHeight, offsetTop: 0, ready: true });
      return;
    }

    const read = () => setVp({ height: vv.height, offsetTop: vv.offsetTop, ready: true });
    read();

    // Both matter. `resize` fires when the keyboard opens; `scroll` fires when
    // the page is panned to keep a focused field visible, which moves the
    // visible area without changing its size.
    vv.addEventListener("resize", read);
    vv.addEventListener("scroll", read);
    return () => {
      vv.removeEventListener("resize", read);
      vv.removeEventListener("scroll", read);
    };
  }, []);

  return vp;
}
