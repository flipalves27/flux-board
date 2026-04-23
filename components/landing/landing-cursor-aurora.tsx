"use client";

import { useEffect, useRef } from "react";

/**
 * LandingCursorAurora — orbe de luz suave que acompanha o cursor.
 *
 * Interação inteligente: usa RAF para lerp (transição suave) até a posição do
 * mouse — 60fps sem travar o main thread. Desativa automaticamente em touch
 * devices e respeita `prefers-reduced-motion`.
 *
 * Renderizado como camada fixa `pointer-events-none` no topo da landing.
 */
export function LandingCursorAurora() {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    // respeita prefers-reduced-motion
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (motionQuery.matches) {
      node.style.opacity = "0";
      return;
    }

    // descarta em dispositivos puramente touch (sem hover)
    const hoverQuery = window.matchMedia("(hover: hover) and (pointer: fine)");
    if (!hoverQuery.matches) {
      node.style.opacity = "0";
      return;
    }

    let targetX = window.innerWidth / 2;
    let targetY = window.innerHeight * 0.35;
    let currentX = targetX;
    let currentY = targetY;
    let raf = 0;
    let visible = false;

    const onMove = (e: MouseEvent) => {
      targetX = e.clientX;
      targetY = e.clientY;
      if (!visible) {
        visible = true;
        node.style.opacity = "1";
      }
    };
    const onLeave = () => {
      visible = false;
      node.style.opacity = "0";
    };

    const tick = () => {
      // lerp suave
      currentX += (targetX - currentX) * 0.12;
      currentY += (targetY - currentY) * 0.12;
      node.style.transform = `translate3d(${currentX - 200}px, ${currentY - 200}px, 0)`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerleave", onLeave);
    document.addEventListener("mouseleave", onLeave);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerleave", onLeave);
      document.removeEventListener("mouseleave", onLeave);
    };
  }, []);

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className="landing-cursor-aurora pointer-events-none fixed left-0 top-0 z-[1] h-[400px] w-[400px] rounded-full opacity-0"
      style={{
        background:
          "radial-gradient(circle at center, color-mix(in srgb, var(--flux-primary) 28%, transparent) 0%, color-mix(in srgb, var(--flux-secondary) 16%, transparent) 38%, transparent 70%)",
        filter: "blur(48px)",
        willChange: "transform, opacity",
        transition: "opacity 400ms ease-out",
        mixBlendMode: "screen",
      }}
    />
  );
}
