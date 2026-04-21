"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * SpotlightMode — "Zen mode" para a lista de boards.
 *
 * Quando ativo, aplica `data-flux-spotlight="1"` em `<body>`:
 *   - `.flux-spotlight-dim` → esmaece e desfoca (header, analytics, capability strip)
 *   - `.flux-spotlight-stage` → destaca (grid de boards)
 *
 * Atalho de teclado: `F` (alternar), `Esc` (sair).
 * Persiste em localStorage para continuar entre sessões do mesmo usuário.
 */
const STORAGE_KEY = "flux.boards.spotlight.v1";

export function useSpotlightMode() {
  const [active, setActive] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_KEY) === "1") setActive(true);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    if (active) {
      document.body.setAttribute("data-flux-spotlight", "1");
      try {
        localStorage.setItem(STORAGE_KEY, "1");
      } catch {
        // ignore
      }
    } else {
      document.body.removeAttribute("data-flux-spotlight");
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        // ignore
      }
    }
    return () => {
      document.body.removeAttribute("data-flux-spotlight");
    };
  }, [active]);

  const toggle = useCallback(() => setActive((v) => !v), []);
  const exit = useCallback(() => setActive(false), []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if (typing) return;
      if (e.key === "Escape" && active) {
        e.preventDefault();
        setActive(false);
      } else if ((e.key === "f" || e.key === "F") && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setActive((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active]);

  return { active, toggle, exit };
}

export function SpotlightModeToggle({
  active,
  onToggle,
  locale = "pt-BR",
}: {
  active: boolean;
  onToggle: () => void;
  locale?: string;
}) {
  const isEn = locale.startsWith("en");
  const label = active
    ? isEn
      ? "Spotlight ON"
      : "Foco ligado"
    : isEn
      ? "Spotlight"
      : "Modo foco";
  const hint = isEn
    ? "Toggle with F · Esc to exit"
    : "Atalho: F · Esc para sair";

  return (
    <button
      type="button"
      onClick={onToggle}
      className="flux-spotlight-toggle"
      data-active={active ? "true" : undefined}
      title={hint}
      aria-pressed={active}
      aria-label={label}
    >
      <span aria-hidden="true" style={{ fontSize: 13 }}>
        {active ? "●" : "○"}
      </span>
      <span>{label}</span>
      <span
        className="hidden sm:inline text-[10px] opacity-70"
        style={{
          padding: "1px 6px",
          borderRadius: 4,
          background: "color-mix(in srgb, var(--flux-chrome) 10%, transparent)",
        }}
      >
        F
      </span>
    </button>
  );
}
