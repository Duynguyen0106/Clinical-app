"use client";

import { useEffect } from "react";

const READY_TYPE = "treow-booking-embed";

/**
 * Notify a parent clinic website that the Treow booking iframe is ready,
 * and keep frame height in sync via postMessage.
 *
 * Parent sites (e.g. nguyensosteopathy.com/book) listen for
 * `{ height | frameHeight }` and may key off `type: "treow-booking-embed"`.
 */
export function EmbedFrameBridge() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.parent === window) return;

    const post = (extra: Record<string, unknown> = {}) => {
      const height = Math.ceil(
        Math.max(
          document.documentElement.scrollHeight,
          document.body?.scrollHeight ?? 0,
          document.documentElement.offsetHeight,
        ),
      );
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
      ro.observe(document.documentElement);
      if (document.body) ro.observe(document.body);
    }

    const onLoad = () => post({ event: "ready" });
    window.addEventListener("load", onLoad);
    const interval = window.setInterval(() => post(), 1500);

    return () => {
      ro?.disconnect();
      window.removeEventListener("load", onLoad);
      window.clearInterval(interval);
    };
  }, []);

  return null;
}
