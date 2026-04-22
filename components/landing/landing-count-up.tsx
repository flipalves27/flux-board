"use client";

import { useEffect, useRef, useState } from "react";

/**
 * LandingCountUp — anima um número subindo quando o elemento entra no viewport.
 *
 * Interação inteligente:
 *   - Usa IntersectionObserver para disparar a animação só na hora certa
 *   - Respeita `prefers-reduced-motion` (mostra valor final direto)
 *   - Suporta prefixo/sufixo e formatação locale-aware
 *   - Curva ease-out-quart para dar sensação de impacto no início
 */

type LandingCountUpProps = {
  /** Valor final (number) — se for string (ex.: "∞", "3 min"), renderiza direto. */
  value: number | string;
  /** Duração em ms (default: 1600). */
  duration?: number;
  /** Prefixo (ex.: "R$"). */
  prefix?: string;
  /** Sufixo (ex.: "%", " dias"). */
  suffix?: string;
  /** Casas decimais (default: 0). */
  decimals?: number;
  /** Classe aplicada ao span. */
  className?: string;
  /** Locale BCP47 para formatação (default: pt-BR). */
  locale?: string;
};

export function LandingCountUp({
  value,
  duration = 1600,
  prefix,
  suffix,
  decimals = 0,
  className,
  locale = "pt-BR",
}: LandingCountUpProps) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const [display, setDisplay] = useState(() => {
    if (typeof value === "string") return value;
    return formatNumber(0, decimals, locale);
  });

  useEffect(() => {
    if (typeof value === "string") {
      setDisplay(value);
      return;
    }
    const node = ref.current;
    if (!node) return;

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (motionQuery.matches) {
      setDisplay(formatNumber(value, decimals, locale));
      return;
    }

    let raf = 0;
    let started = false;

    const run = (from: number) => {
      const start = performance.now();
      const delta = value - from;
      const step = (now: number) => {
        const elapsed = now - start;
        const t = Math.min(1, elapsed / duration);
        const eased = 1 - Math.pow(1 - t, 4);
        const current = from + delta * eased;
        setDisplay(formatNumber(current, decimals, locale));
        if (t < 1) {
          raf = requestAnimationFrame(step);
        }
      };
      raf = requestAnimationFrame(step);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && !started) {
            started = true;
            run(0);
            observer.disconnect();
          }
        }
      },
      { threshold: 0.4 }
    );
    observer.observe(node);

    return () => {
      observer.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [value, duration, decimals, locale]);

  return (
    <span ref={ref} className={className} aria-live="polite">
      {prefix}
      {display}
      {suffix}
    </span>
  );
}

function formatNumber(n: number, decimals: number, locale: string): string {
  try {
    return n.toLocaleString(locale, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  } catch {
    return n.toFixed(decimals);
  }
}
