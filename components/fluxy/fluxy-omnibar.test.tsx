import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { FluxyOmnibar } from "./fluxy-omnibar";

const mockFlags = vi.fn(() => ({ enabled: true, omnibar: true, dailyBriefing: false, anomalyToasts: false }));
const mockPost = vi.fn();

vi.mock("./use-onda4-flags", () => ({
  useOnda4Flags: () => mockFlags(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/pt-BR/boards",
}));

vi.mock("next-intl", () => ({
  useLocale: () => "pt-BR",
}));

vi.mock("@/context/auth-context", () => ({
  useAuth: () => ({ getHeaders: () => ({}) }),
}));

vi.mock("@/lib/api-client", () => ({
  apiPost: (...args: unknown[]) => mockPost(...args),
  ApiError: class extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
}));

vi.mock("@/stores/fluxy-omnibar-store", () => ({
  useFluxyOmnibarStore: (sel: (s: { pendingSeed: null; setPendingSeed: () => void; pushHistory: () => void }) => unknown) =>
    sel({
      pendingSeed: null,
      setPendingSeed: vi.fn(),
      pushHistory: vi.fn(),
    }),
}));

describe("FluxyOmnibar", () => {
  beforeEach(() => {
    mockPost.mockResolvedValue({
      intent: "nav_boards",
      speech: "Abrindo boards.",
      results: [{ id: "x", title: "Boards", action: { type: "navigate", path: "/boards" } }],
      meta: { costHint: "none", classifierTier: "local", confidence: 0.9, locale: "pt-BR" },
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders closed chip with keyboard hint when flags on", () => {
    render(<FluxyOmnibar />);
    expect(screen.getByText("Fluxy")).toBeTruthy();
    expect(screen.getByText("⌘K")).toBeTruthy();
  });

  it("respects reduced motion when matchMedia exists", () => {
    window.matchMedia = vi.fn().mockImplementation(() => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    render(<FluxyOmnibar />);
    expect(window.matchMedia).toHaveBeenCalled();
  });
});
