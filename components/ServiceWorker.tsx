"use client";

import { useEffect } from "react";

export function ServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // A failed registration costs offline reads, nothing else. Not worth
      // surfacing to the one person using this.
    });
  }, []);
  return null;
}
