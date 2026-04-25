"use client";

import { useCallback, useLayoutEffect, useState } from "react";

const MD_QUERY = "(min-width: 768px)";
const LS_L2 = "flux-board.chrome.l2.open";
const LS_L3 = "flux-board.chrome.l3.open";

export type BoardChromeResponsive = {
  /** `true` when viewport is Tailwind `md` and up (informational / analytics only). */
  isMdUp: boolean;
  l2Open: boolean;
  l3Open: boolean;
  setL2Open: (next: boolean) => void;
  setL3Open: (next: boolean) => void;
};

/**
 * L2/L3 (filtros + contexto) são recolhíveis em **todos** os tamanhos de ecrã.
 * - Primeira visita: recolhido (mais espaço para o canvas); `localStorage` persiste a preferência.
 * - Preferência do utilizador persiste ao redimensionar.
 */
export function useBoardChromeResponsive(): BoardChromeResponsive {
  const [isMdUp, setIsMdUp] = useState(true);
  const [l2Open, setL2OpenState] = useState(false);
  const [l3Open, setL3OpenState] = useState(false);

  useLayoutEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      setIsMdUp(true);
      setL2OpenState(false);
      setL3OpenState(false);
      return;
    }
    const mq = window.matchMedia(MD_QUERY);
    const readInitial = () => {
      const md = mq.matches;
      setIsMdUp(md);
      try {
        const s2 = localStorage.getItem(LS_L2);
        const s3 = localStorage.getItem(LS_L3);
        setL2OpenState(s2 !== null ? s2 === "1" : false);
        setL3OpenState(s3 !== null ? s3 === "1" : false);
      } catch {
        setL2OpenState(false);
        setL3OpenState(false);
      }
    };
    readInitial();
    const onMq = () => setIsMdUp(mq.matches);
    mq.addEventListener("change", onMq);
    return () => mq.removeEventListener("change", onMq);
  }, []);

  const setL2Open = useCallback((next: boolean) => {
    setL2OpenState(next);
    try {
      localStorage.setItem(LS_L2, next ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, []);

  const setL3Open = useCallback((next: boolean) => {
    setL3OpenState(next);
    try {
      localStorage.setItem(LS_L3, next ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, []);

  return { isMdUp, l2Open, l3Open, setL2Open, setL3Open };
}
