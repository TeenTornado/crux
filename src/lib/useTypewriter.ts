"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Reveal `text` progressively (token-by-token feel). Runs once per mount unless
 * `enabled` is false, in which case the full text shows immediately.
 */
export function useTypewriter(text: string, enabled = true, cps = 90) {
  const [shown, setShown] = useState(enabled ? "" : text);
  const done = useRef(false);

  useEffect(() => {
    if (!enabled) {
      setShown(text);
      return;
    }
    if (done.current) return;
    let i = 0;
    // Reveal ~2-3 chars per tick for a natural streaming cadence.
    const stepChars = Math.max(1, Math.round(cps / 30));
    const id = setInterval(() => {
      i = Math.min(text.length, i + stepChars);
      setShown(text.slice(0, i));
      if (i >= text.length) {
        clearInterval(id);
        done.current = true;
      }
    }, 33);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { shown, complete: done.current || !enabled };
}
