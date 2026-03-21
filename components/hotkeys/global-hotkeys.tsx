"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { useHotkeys } from "@/hooks/use-hotkeys";
import { resolveHotkeyPatterns } from "@/lib/hotkeys/custom-bindings";
import { KeyboardShortcutsModal } from "./keyboard-shortcuts-modal";

/** App-wide shortcuts (navigation, cheatsheet). Mount once inside the authenticated shell. */
export function GlobalHotkeys() {
  const router = useRouter();
  const locale = useLocale();
  const localeRoot = `/${locale}`;
  const [cheatsheetOpen, setCheatsheetOpen] = useState(false);

  const patterns = useMemo(() => resolveHotkeyPatterns(), []);

  const bindings = useMemo(() => {
    const p = patterns;
    const m: Record<string, (e: KeyboardEvent) => void> = {};
    m[p["nav.boards"]] = (e) => {
      e.preventDefault();
      router.push(`${localeRoot}/boards`);
    };
    m[p["nav.reports"]] = (e) => {
      e.preventDefault();
      router.push(`${localeRoot}/reports`);
    };
    m[p["ui.cheatsheet"]] = (e) => {
      e.preventDefault();
      setCheatsheetOpen((open) => !open);
    };
    return m;
  }, [localeRoot, patterns, router]);

  const onCloseCheatsheet = useCallback(() => setCheatsheetOpen(false), []);

  useHotkeys(bindings);

  return <KeyboardShortcutsModal open={cheatsheetOpen} onClose={onCloseCheatsheet} />;
}
