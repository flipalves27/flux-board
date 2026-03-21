"use client";

import { useEffect, useRef, useState } from "react";

const DEFAULT_MIN_MS = 200;

/**
 * Keeps "loading UI" visible for at least `minMs` after a loading cycle starts,
 * avoiding a flash when the network responds faster than perception.
 */
export function useMinimumSkeletonDuration(loading: boolean, minMs = DEFAULT_MIN_MS): boolean {
  const [showSkeleton, setShowSkeleton] = useState(loading);
  const cycleStartRef = useRef<number | null>(null);

  useEffect(() => {
    if (loading) {
      cycleStartRef.current = Date.now();
      setShowSkeleton(true);
      return;
    }
    const start = cycleStartRef.current;
    const elapsed = start != null ? Date.now() - start : minMs;
    const delay = Math.max(0, minMs - elapsed);
    const id = window.setTimeout(() => setShowSkeleton(false), delay);
    return () => window.clearTimeout(id);
  }, [loading, minMs]);

  return showSkeleton;
}
