"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { useHotkeys } from "@/hooks/use-hotkeys";
import { classifyFluxyIntentLocal, type FluxyIntent } from "@/lib/fluxy-intent-classifier";
import { useOnda4Flags } from "./use-onda4-flags";

function mapIntentToPath(intent: FluxyIntent, localeRoot: string): string | null {
  switch (intent) {
    case "nav_boards":
      return `${localeRoot}/boards`;
    case "nav_portfolio":
      return `${localeRoot}/portfolio`;
    case "nav_routines":
      return `${localeRoot}/routines`;
    case "nav_equipe":
      return `${localeRoot}/equipe?tab=membros`;
    default:
      return null;
  }
}

export function FluxyOmnibar() {
  const flags = useOnda4Flags();
  const router = useRouter();
  const locale = useLocale();
  const localeRoot = `/${locale}`;
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    setQ("");
  }, []);

  const omnibarHotkeys = useMemo(
    () => ({
      "$mod+Shift+K": (e: KeyboardEvent) => {
        e.preventDefault();
        setOpen((v) => !v);
      },
    }),
    []
  );

  useHotkeys(omnibarHotkeys, { enabled: flags.enabled && flags.omnibar });

  useEffect(() => {
    if (!open) return;
    const id = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(id);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  if (!flags.enabled || !flags.omnibar) return null;

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const { intent } = classifyFluxyIntentLocal(q);
    if (intent === "open_command_palette") {
      window.dispatchEvent(new CustomEvent("flux-open-command-palette"));
      close();
      return;
    }
    const path = mapIntentToPath(intent, localeRoot);
    if (path) {
      router.push(path);
      close();
      return;
    }
    router.push(`${localeRoot}/boards`);
    close();
  }

  if (!open) {
    return (
      <button
        type="button"
        className="fixed bottom-[max(5.5rem,env(safe-area-inset-bottom,0px))] left-1/2 z-[var(--flux-z-command-content)] hidden -translate-x-1/2 items-center gap-2 rounded-full border border-[var(--flux-border-subtle)] bg-[var(--flux-surface-card)] px-4 py-2 text-xs font-medium text-[var(--flux-text-muted)] shadow-[var(--flux-shadow-md)] md:flex"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
      >
        Fluxy <kbd className="rounded bg-[var(--flux-surface-elevated)] px-1">⌘⇧K</kbd>
      </button>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[var(--flux-z-command-backdrop)] flex items-start justify-center bg-[color-mix(in_srgb,var(--flux-surface-dark)_55%,transparent)] p-4 pt-[15vh] backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Fluxy omnibar"
    >
      <form
        onSubmit={onSubmit}
        className="relative z-[var(--flux-z-command-content)] flux-surface-3 w-full max-w-lg p-4 shadow-[var(--flux-shadow-xl)]"
      >
        <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--flux-secondary-light)]">Fluxy</p>
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Ir para boards, portfólio, rotinas, equipe…"
          className="mt-2 w-full rounded-[var(--flux-rad)] border border-[var(--flux-border-muted)] bg-[var(--flux-surface-card)] px-3 py-2 text-sm text-[var(--flux-text)] outline-none focus:border-[var(--flux-primary)]"
        />
        <div className="mt-3 flex justify-end gap-2">
          <button type="button" className="btn-secondary px-3 py-1.5 text-xs" onClick={close}>
            Fechar
          </button>
          <button type="submit" className="btn-primary px-3 py-1.5 text-xs">
            Ir
          </button>
        </div>
      </form>
    </div>
  );
}
