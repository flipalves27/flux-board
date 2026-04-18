"use client";

import { useCallback, useRef } from "react";

const THRESHOLD_PX = 56;

type Opts = {
  onSwipeRight?: () => void;
  onSwipeLeft?: () => void;
};

/** Horizontal swipe hints on touch devices (opens description / edit without long-press). */
export function useCardSwipeActions({ onSwipeRight, onSwipeLeft }: Opts) {
  const startX = useRef(0);
  const startY = useRef(0);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (!e.touches[0]) return;
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
  }, []);

  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      const t = e.changedTouches[0];
      if (!t) return;
      const dx = t.clientX - startX.current;
      const dy = Math.abs(t.clientY - startY.current);
      if (dy > 48) return;
      if (dx > THRESHOLD_PX) onSwipeRight?.();
      else if (dx < -THRESHOLD_PX) onSwipeLeft?.();
    },
    [onSwipeLeft, onSwipeRight]
  );

  return { onTouchStart, onTouchEnd };
}
