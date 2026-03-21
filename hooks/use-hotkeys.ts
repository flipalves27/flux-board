"use client";

import { useEffect, useMemo, useRef } from "react";
import { tinykeys } from "tinykeys";
import { isEditableTarget } from "@/lib/hotkeys/editable-target";

type UseHotkeysOptions = {
  enabled?: boolean;
  /** When true (default), shortcuts are ignored while focus is in an input/textarea/etc. */
  skipWhenEditable?: boolean;
};

/**
 * Registers global keybindings via tinykeys. Handlers are not invoked when an
 * input/textarea/contenteditable is focused (unless skipWhenEditable is false).
 */
export function useHotkeys(
  keyBindingMap: Record<string, (e: KeyboardEvent) => void>,
  options?: UseHotkeysOptions
) {
  const enabled = options?.enabled ?? true;
  const skipWhenEditable = options?.skipWhenEditable ?? true;
  const mapRef = useRef(keyBindingMap);
  mapRef.current = keyBindingMap;

  const serialized = useMemo(() => JSON.stringify(Object.keys(keyBindingMap).sort()), [keyBindingMap]);

  useEffect(() => {
    if (!enabled) return;
    const wrapped: Record<string, (e: KeyboardEvent) => void> = {};
    for (const pattern of Object.keys(mapRef.current)) {
      wrapped[pattern] = ((pat: string) => (e: KeyboardEvent) => {
        if (skipWhenEditable && isEditableTarget(e.target)) return;
        mapRef.current[pat]?.(e);
      })(pattern);
    }
    return tinykeys(window, wrapped);
  }, [enabled, skipWhenEditable, serialized]);
}
