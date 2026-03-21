"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";
import { useAuth } from "@/context/auth-context";
import { apiFetch } from "@/lib/api-client";
import {
  readThemePreferenceFromStorage,
  writeThemePreferenceToStorage,
  type ThemePreference,
} from "@/lib/theme-storage";

export type { ThemePreference };

const PREF_CYCLE: ThemePreference[] = ["system", "light", "dark"];

function resolveTheme(preference: ThemePreference, systemDark: boolean): "light" | "dark" {
  if (preference === "light") return "light";
  if (preference === "dark") return "dark";
  return systemDark ? "dark" : "light";
}

interface ThemeContextType {
  themePreference: ThemePreference;
  resolvedTheme: "light" | "dark";
  setThemePreference: (value: ThemePreference, opts?: { skipRemote?: boolean }) => void;
  cycleThemePreference: () => void;
  theme: "light" | "dark";
  setTheme: (value: ThemePreference) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | null>(null);

function runWithViewTransition(update: () => void): void {
  if (typeof window === "undefined") return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    update();
    return;
  }
  const doc = document as Document & {
    startViewTransition?: (cb: () => void) => { finished: Promise<void> };
  };
  if (doc.startViewTransition) {
    doc.startViewTransition(update);
    return;
  }
  const root = document.documentElement;
  const prevTransition = root.style.transition;
  root.style.transition = "opacity 0.2s ease";
  root.style.opacity = "0.98";
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      update();
      root.style.opacity = "1";
      window.setTimeout(() => {
        root.style.transition = prevTransition;
      }, 220);
    });
  });
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { user, isChecked, token, getHeaders } = useAuth();
  const [preference, setPreference] = useState<ThemePreference>(() => readThemePreferenceFromStorage() ?? "system");
  const [systemDark, setSystemDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  useLayoutEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    setSystemDark(mq.matches);
    const fn = () => setSystemDark(mq.matches);
    mq.addEventListener("change", fn);
    setMounted(true);
    return () => mq.removeEventListener("change", fn);
  }, []);

  const lastUserSync = useRef<string | null>(null);
  useEffect(() => {
    if (!isChecked || !user) {
      if (!user) lastUserSync.current = null;
      return;
    }
    const tp = user.themePreference;
    if (tp !== "light" && tp !== "dark" && tp !== "system") return;
    const sig = `${user.id}:${tp}`;
    if (lastUserSync.current === sig) return;
    lastUserSync.current = sig;
    flushSync(() => setPreference(tp));
    writeThemePreferenceToStorage(tp);
  }, [isChecked, user]);

  const resolvedTheme = resolveTheme(preference, systemDark);

  useLayoutEffect(() => {
    if (!mounted) return;
    document.documentElement.setAttribute("data-theme", resolvedTheme);
  }, [mounted, resolvedTheme]);

  const setThemePreference = useCallback(
    (value: ThemePreference, opts?: { skipRemote?: boolean }) => {
      runWithViewTransition(() => {
        flushSync(() => setPreference(value));
      });
      writeThemePreferenceToStorage(value);
      if (!opts?.skipRemote && token) {
        void apiFetch("/api/users/me/theme", {
          method: "PATCH",
          body: JSON.stringify({ themePreference: value }),
          headers: getHeaders(),
        }).catch(() => {});
      }
    },
    [token, getHeaders]
  );

  const cycleThemePreference = useCallback(() => {
    const idx = PREF_CYCLE.indexOf(preference);
    const next = PREF_CYCLE[(idx === -1 ? 0 : idx + 1) % PREF_CYCLE.length];
    setThemePreference(next);
  }, [preference, setThemePreference]);

  const toggleTheme = useCallback(() => {
    setThemePreference(resolvedTheme === "dark" ? "light" : "dark");
  }, [resolvedTheme, setThemePreference]);

  const setTheme = useCallback(
    (value: ThemePreference) => {
      setThemePreference(value);
    },
    [setThemePreference]
  );

  return (
    <ThemeContext.Provider
      value={{
        themePreference: preference,
        resolvedTheme,
        theme: resolvedTheme,
        setThemePreference,
        setTheme,
        cycleThemePreference,
        toggleTheme,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
