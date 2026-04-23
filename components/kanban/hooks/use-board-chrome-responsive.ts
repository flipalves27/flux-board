"use client";

import { useCallback, useEffect, useState } from "react";

const MD_QUERY = "(min-width: 768px)";
const LS_L2 = "flux-board.chrome.l2.open";
const LS_L3 = "flux-board.chrome.l3.open";

export type BoardChromeResponsive = {
  /** `true` when viewport is Tailwind `md` and up. */
  isMdUp: boolean;
  l2Open: boolean;
  l3Open: boolean;
  setL2Open: (next: boolean) => void;
  setL3Open: (next: boolean) => void;
};

/**
 * L2/L3 default collapsed below `md`; expanded from `md` up.
 * Persists user overrides on small viewports in localStorage.
 */
export function useBoardChromeResponsive(): BoardChromeResponsive {
  const [isMdUp, setIsMdUp] = useState(true);
  const [l2Open, setL2OpenState] = useState(true);
  const [l3Open, setL3OpenState] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      setIsMdUp(true);
      setL2OpenState(true);
      setL3OpenState(true);
      return;
    }
    const mq = window.matchMedia(MD_QUERY);
    const apply = () => {
      const md = mq.matches;
      setIsMdUp(md);
      if (md) {
        setL2OpenState(true);
        setL3OpenState(true);
        return;
      }
      try {
        const s2 = localStorage.getItem(LS_L2);
        const s3 = localStorage.getItem(LS_L3);
        setL2OpenState(s2 === null ? false : s2 === "1");
        setL3OpenState(s3 === null ? false : s3 === "1");
      } catch {
        setL2OpenState(false);
        setL3OpenState(false);
      }
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const setL2Open = useCallback((next: boolean) => {
    setL2OpenState(next);
    if (typeof window !== "undefined" && !window.matchMedia(MD_QUERY).matches) {
      try {
        localStorage.setItem(LS_L2, next ? "1" : "0");
      } catch {
        /* ignore */
      }
    }
  }, []);

  const setL3Open = useCallback((next: boolean) => {
    setL3OpenState(next);
    if (typeof window !== "undefined" && !window.matchMedia(MD_QUERY).matches) {
      try {
        localStorage.setItem(LS_L3, next ? "1" : "0");
      } catch {
        /* ignore */
      }
    }
  }, []);

  return { isMdUp, l2Open, l3Open, setL2Open, setL3Open };
}
