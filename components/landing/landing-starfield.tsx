"use client";

import { useReducedMotion } from "framer-motion";
import { useEffect, useRef } from "react";

type Star = { x: number; y: number; r: number; o: number; vy: number };

/**
 * Canvas starfield for the public landing (doc v2). Respects `prefers-reduced-motion`
 * via Framer Motion — stars drift only when motion is allowed.
 */
export function LandingStarfield({ className = "" }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let stars: Star[] = [];
    let raf = 0;
    const parent = canvas.parentElement;
    let textColorHex = "f0eeff";

    function syncTextHexFromCss() {
      if (typeof document === "undefined") return;
      const v = getComputedStyle(document.documentElement).getPropertyValue("--flux-text").trim();
      const m = v.match(/^#([\da-fA-F]{6})$/i);
      if (m) textColorHex = m[1].toLowerCase();
    }

    function resize() {
      if (!canvas || !ctx) return;
      syncTextHexFromCss();
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      const dpr = Math.min(typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1, 2);
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const area = w * h;
      const count = Math.floor(area / 9000);
      const n = Math.min(160, Math.max(48, count));
      stars = Array.from({ length: n }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        r: Math.random() * 1.15 + 0.25,
        o: Math.random() * 0.45 + 0.15,
        vy: Math.random() * 0.1 + 0.02,
      }));
    }

    const ro = parent ? new ResizeObserver(resize) : null;
    if (parent) ro?.observe(parent);
    resize();

    function tick() {
      if (!canvas || !ctx) return;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      ctx.clearRect(0, 0, w, h);
      const drift = !reduceMotion;
      for (const s of stars) {
        ctx.beginPath();
        ctx.save();
        ctx.globalAlpha = s.o;
        ctx.fillStyle = "#" + textColorHex;
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        if (drift) {
          s.y += s.vy;
          if (s.y > h + 3) s.y = -3;
        }
      }
      raf = requestAnimationFrame(tick);
    }
    tick();

    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
    };
  }, [reduceMotion]);

  return (
    <canvas
      ref={canvasRef}
      className={`pointer-events-none absolute inset-0 h-full w-full ${className}`.trim()}
      aria-hidden
    />
  );
}
