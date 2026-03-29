/** Keys and bootstrap script shared by server layout (inline) and client theme code. */

export const THEME_PREFERENCE_KEY = "flux_theme_preference";
export const THEME_LEGACY_KEY = "flux_theme";

export type ThemePreference = "light" | "dark" | "system";

export function readThemePreferenceFromStorage(): ThemePreference | null {
  if (typeof window === "undefined") return null;
  try {
    const p = localStorage.getItem(THEME_PREFERENCE_KEY);
    if (p === "light" || p === "dark" || p === "system") return p;
    const leg = localStorage.getItem(THEME_LEGACY_KEY);
    if (leg === "light" || leg === "dark") return leg;
  } catch {
    /* ignore */
  }
  return null;
}

export function writeThemePreferenceToStorage(preference: ThemePreference): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(THEME_PREFERENCE_KEY, preference);
    const resolved =
      preference === "light"
        ? "light"
        : preference === "dark"
          ? "dark"
          : window.matchMedia("(prefers-color-scheme: dark)").matches
            ? "dark"
            : "light";
    localStorage.setItem(THEME_LEGACY_KEY, resolved);
  } catch {
    /* ignore */
  }
}

/**
 * Runs before React paint to avoid flash; keeps in sync with readThemePreferenceFromStorage.
 */
export function themeBootstrapInlineScript(): string {
  const P = THEME_PREFERENCE_KEY;
  const L = THEME_LEGACY_KEY;
  return `(function(){try{var p=localStorage.getItem("${P}");if(p!=="light"&&p!=="dark"&&p!=="system")p=null;if(!p){var leg=localStorage.getItem("${L}");if(leg==="light"||leg==="dark")p=leg;}if(!p)p="dark";var r=p==="light"?"light":p==="dark"?"dark":(window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");document.documentElement.setAttribute("data-theme",r);}catch(e){}})();`;
}
