import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { CommandPalette } from "./command-palette";

const pushMock = vi.fn();
const apiGetMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
  }),
  usePathname: () => "/pt-BR/boards",
}));

vi.mock("next-intl", () => ({
  useLocale: () => "pt-BR",
  useTranslations: () => (key: string, params?: Record<string, string>) => {
    if (params?.board) return `${key}:${params.board}`;
    return key;
  },
}));

vi.mock("@/context/auth-context", () => ({
  useAuth: () => ({
    isChecked: true,
    user: { id: "u1", isAdmin: true, orgRole: "owner" },
    getHeaders: () => ({}),
  }),
}));

vi.mock("@/lib/api-client", () => ({
  apiGet: (...args: unknown[]) => apiGetMock(...args),
  ApiError: class ApiError extends Error {
    status = 500;
  },
}));

vi.mock("@/lib/board-shortcuts", () => ({
  getBoardShortcuts: () => ({ recents: [{ boardId: "b1" }] }),
}));

vi.mock("@/lib/recent-cards", () => ({
  getRecentCards: () => [{ boardId: "b1", boardName: "Board A", cardId: "c1", title: "Card Alpha" }],
}));

vi.mock("@/lib/command-palette-history", () => ({
  getCommandHistory: () => [],
  pushCommandHistory: (_userId: string, entry: unknown) => [entry],
}));

vi.mock("@/lib/command-palette-ai", () => ({
  parseNaturalLanguageCommand: () => ({ type: "unknown", confidence: 0 }),
}));

vi.mock("@/lib/rbac", () => ({
  isPlatformAdminSession: () => false,
  sessionCanManageMembersAndBilling: () => true,
  sessionCanManageOrgBilling: () => true,
}));

vi.mock("cmdk", () => {
  const CommandRoot = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;
  const Dialog = ({ open, children }: { open: boolean; children: React.ReactNode }) => (open ? <div>{children}</div> : null);
  const Input = ({ value, onValueChange, onKeyDown, placeholder, className }: any) => (
    <input
      value={value}
      onChange={(e) => onValueChange?.(e.target.value)}
      onKeyDown={onKeyDown}
      placeholder={placeholder}
      className={className}
    />
  );
  const List = ({ children, className }: any) => <div className={className}>{children}</div>;
  const Group = ({ heading, children }: any) => (
    <div>
      <div>{heading}</div>
      {children}
    </div>
  );
  const Item = ({ children, onSelect, className }: any) => (
    <button type="button" className={className} onClick={() => onSelect?.()}>
      {children}
    </button>
  );
  const Empty = ({ children }: any) => <div>{children}</div>;
  return { Command: Object.assign(CommandRoot, { Dialog, Input, List, Group, Item, Empty }) };
});

describe("CommandPalette", () => {
  beforeEach(() => {
    pushMock.mockReset();
    apiGetMock.mockReset();
    apiGetMock.mockResolvedValue({ boards: [{ id: "b1", name: "Board A", boardMethodology: "scrum" }] });
  });

  it("opens with ctrl+k and renders federated entries", async () => {
    render(<CommandPalette />);
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });

    await waitFor(() => {
      expect(screen.getByPlaceholderText("placeholder")).toBeTruthy();
    });

    await waitFor(() => {
      expect(screen.getAllByText("Board A").length).toBeGreaterThan(0);
      expect(screen.getByText("Card Alpha")).toBeTruthy();
      expect(screen.getByText("nav.docs")).toBeTruthy();
      expect(screen.getByText("nav.sprints")).toBeTruthy();
    });
  });

  it("executes action and navigates to board", async () => {
    render(<CommandPalette />);
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });

    await waitFor(() => {
      expect(screen.getAllByText("Board A").length).toBeGreaterThan(0);
    });

    const boardButton = screen
      .getAllByRole("button")
      .find((b) => (b.textContent ?? "").includes("Board A") && (b.textContent ?? "").includes("subtitles.openBoard"));
    expect(boardButton).toBeTruthy();
    fireEvent.click(boardButton!);
    expect(pushMock).toHaveBeenCalledWith("/pt-BR/board/b1");
  });
});

