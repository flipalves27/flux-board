"use client";

import { useEffect, useRef } from "react";

/**
 * LandingScrollProgress — barra gradiente fixa no topo do viewport que indica
 * o progresso de scroll da landing (0 → 100%).
 *
 * Interação inteligente:
 *   - Usa rAF throttling para não poluir scroll events
 *   - Usa `transform: scaleX(...)` em vez de `width` (evita reflow)
 *   - Respeita `prefers-reduced-motion` mantendo a barra estática (ainda
 *     informativa, sem transição)
 */
export function LandingScrollProgress() {
  const barRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;

    let raf = 0;
    let scheduled = false;

    const update = () => {
      scheduled = false;
      const doc = document.documentElement;
      const scrollTop = doc.scrollTop || document.body.scrollTop;
      const max = (doc.scrollHeight || document.body.scrollHeight) - doc.clientHeight;
      const pct = max > 0 ? Math.min(1, Math.max(0, scrollTop / max)) : 0;
      bar.style.transform = `scaleX(${pct})`;
    };

    const onScroll = () => {
      if (!scheduled) {
        scheduled = true;
        raf = requestAnimationFrame(update);
      }
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 top-0 z-[80] h-[3px] origin-left"
      style={{
        background:
          "linear-gradient(90deg, var(--flux-primary) 0%, var(--flux-secondary) 55%, var(--flux-accent) 100%)",
        boxShadow:
          "0 2px 14px color-mix(in srgb, var(--flux-primary) 45%, transparent)",
      }}
    >
      <div
        ref={barRef}
        className="h-full w-full origin-left"
        style={{
          background: "inherit",
          transform: "scaleX(0)",
          transition: "transform 120ms linear",
        }}
      />
    </div>
  );
}
