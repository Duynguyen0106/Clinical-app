"use client";

import { useEffect } from "react";

/**
 * Register the shell SW. Clears legacy treow-shell-v1 caches that stored /app
 * HTML cache-first and broke App Router soft navigation after Worker deploys.
 */
export function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    let cancelled = false;
    void (async () => {
      try {
        if ("caches" in window) {
          const keys = await caches.keys();
          await Promise.all(
            keys
              .filter((k) => k.startsWith("treow-shell-v1"))
              .map((k) => caches.delete(k)),
          );
        }
        if (cancelled) return;
        await navigator.serviceWorker.register("/sw.js");
      } catch {
        /* ignore offline register failures in dev */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return null;
}
