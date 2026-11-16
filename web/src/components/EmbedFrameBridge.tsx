"use client";

import { useEffect } from "react";

const READY_TYPE = "treow-booking-embed";
/** Parent sites (e.g. nguyensosteopathy.com/book) also cap; keep reports sane. */
const MAX_REPORT_HEIGHT = 2800;
const MIN_REPORT_HEIGHT = 480;

/**
 * Notify a parent clinic website that the Treow booking iframe is ready,
 * and keep frame height in sync via postMessage.
 *
 * Parent sites listen for `{ height | frameHeight }` and may key off
 * `type: "treow-booking-embed"`.
 *
 * Important: do NOT use documentElement.scrollHeight alone when the shell has
 * min-height: 100vh — the parent grows the iframe, 100vh grows, and height
 * feedback-loops to thousands of px (widget looks blank / unusable).
 */
export function EmbedFrameBridge() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.parent === window) return;

    const measure = () => {
      const root =
        document.querySelector<HTMLElement>(".embed-root") ||
        document.querySelector<HTMLElement>(".book-page-embed") ||
        document.body;
      const content = Math.ceil(
        Math.max(
          root?.scrollHeight ?? 0,
          root?.offsetHeight ?? 0,
          document.body?.scrollHeight ?? 0,
        ),
      );
      return Math.min(
        MAX_REPORT_HEIGHT,
        Math.max(MIN_REPORT_HEIGHT, content || MIN_REPORT_HEIGHT),
      );
    };

    let lastSent = 0;
    const post = (extra: Record<string, unknown> = {}) => {
      const height = measure();
      // Skip no-op resize spam; always allow ready.
      if (extra.event !== "ready" && Math.abs(height - lastSent) < 8) return;
      lastSent = height;
      const payload = {
        type: READY_TYPE,
        event: "resize",
        height,
        frameHeight: height,
        ...extra,
      };
      try {
        window.parent.postMessage(payload, "*");
      } catch {
        /* ignore cross-origin post failures */
      }
    };

    post({ event: "ready" });

    const ro =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => post())
        : null;
    if (ro) {
      const root = document.querySelector(".embed-root") || document.body;
      if (root) ro.observe(root);
      const shell = document.querySelector(".book-shell");
      if (shell) ro.observe(shell);
    }

    const onLoad = () => post({ event: "ready" });
    window.addEventListener("load", onLoad);
    // Slower than before — enough for step changes, less feedback churn.
    const interval = window.setInterval(() => post(), 2500);

    return () => {
      ro?.disconnect();
      window.removeEventListener("load", onLoad);
      window.clearInterval(interval);
    };
  }, []);

  return null;
}
