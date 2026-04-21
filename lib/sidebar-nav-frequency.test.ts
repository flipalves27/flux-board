import { afterEach, describe, expect, it, vi } from "vitest";
import { bumpSidebarNavFreq, readSidebarNavFreq, scoreForSidebarPath } from "./sidebar-nav-frequency";

describe("sidebar-nav-frequency", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    try {
      localStorage.clear();
    } catch {
      /* ignore */
    }
  });

  it("bumps and reads scores for paths", () => {
    const store: Record<string, string> = {};
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
      removeItem: (k: string) => {
        delete store[k];
      },
      clear: () => {
        for (const k of Object.keys(store)) delete store[k];
      },
    });

    bumpSidebarNavFreq("/reports");
    bumpSidebarNavFreq("/reports");
    bumpSidebarNavFreq("/ai");

    const m = readSidebarNavFreq();
    expect(scoreForSidebarPath("/reports", m)).toBe(2);
    expect(scoreForSidebarPath("/ai", m)).toBe(1);
    expect(scoreForSidebarPath("/docs", m)).toBe(0);
  });
});
