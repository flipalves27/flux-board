/**
 * Smoke / regression: monta o Kanban com store hidratado (como após loadBoard).
 * Falhas comuns: React #185 (maximum update depth) por efeitos com deps instáveis.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { AbstractIntlMessages } from "next-intl";
import ptBRMessages from "../../messages/pt-BR.json";
import { KanbanBoard } from "./kanban-board";
import { ToastProvider } from "@/context/toast-context";
import { useBoardStore } from "@/stores/board-store";
import { useBoardCollabStore } from "@/stores/board-collab-store";
import type { BoardData, BucketConfig } from "@/app/board/[id]/page";

const BOARD_ID = "b_test_board_open";

const mockBuckets: BucketConfig[] = [
  { key: "backlog", label: "Backlog", color: "var(--flux-primary)" },
];

const minimalBoard: BoardData = {
  version: "2.0",
  lastUpdated: "2020-01-01T00:00:00.000Z",
  cards: [
    {
      id: "c1",
      bucket: "backlog",
      title: "Card teste",
      desc: "",
      priority: "Média",
      progress: "Não iniciado",
      tags: ["alpha", "beta"],
      direction: null,
      dueDate: null,
      blockedBy: [],
      order: 0,
      links: [],
      docRefs: [],
    },
  ],
  config: {
    bucketOrder: mockBuckets,
    collapsedColumns: [],
    labels: ["Comercial"],
  },
  dailyInsights: [],
};

vi.mock("next/navigation", () => {
  const searchParams = new URLSearchParams();
  return {
    useRouter: () => ({
      push: vi.fn(),
      replace: vi.fn(),
      prefetch: vi.fn(),
      back: vi.fn(),
    }),
    useSearchParams: () => searchParams,
    usePathname: () => `/pt-BR/board/${BOARD_ID}`,
  };
});

vi.mock("@/context/auth-context", () => ({
  useAuth: () => ({
    user: {
      id: "u_test",
      username: "tester",
      name: "Tester",
      email: "tester@example.com",
      isAdmin: false,
      orgId: "org_test",
    },
    isLoading: false,
    isChecked: true,
    login: vi.fn(),
    logout: vi.fn().mockResolvedValue(undefined),
    setAuth: vi.fn(),
    getHeaders: () => ({}),
  }),
}));

vi.mock("@/lib/api-client", () => {
  const getApiHeaders = (extra?: Record<string, string>) => ({
    "Content-Type": "application/json",
    ...extra,
  });

  const apiFetch = vi.fn(async (url: string) => {
    if (typeof url === "string" && url.includes("/api/boards/") && !url.includes("/presence")) {
      return new Response(
        JSON.stringify({
          lastUpdated: minimalBoard.lastUpdated,
          cards: minimalBoard.cards,
          version: minimalBoard.version,
          config: minimalBoard.config,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
  });

  return {
    getApiHeaders,
    apiFetch,
    apiGet: vi.fn(async () => ({ ok: false, objectives: [] })),
    apiJson: vi.fn(),
    apiPost: vi.fn(),
    apiPut: vi.fn(),
    apiDelete: vi.fn(),
    ApiError: class ApiError extends Error {
      status = 500;
    },
  };
});

function BoardHarness() {
  return (
    <NextIntlClientProvider locale="pt-BR" messages={ptBRMessages as unknown as AbstractIntlMessages}>
      <ToastProvider>
        <KanbanBoard
          boardName="Board teste"
          boardId={BOARD_ID}
          getHeaders={() => ({})}
          filterLabels={["Comercial"]}
          priorities={["Urgente", "Importante", "Média"]}
          progresses={["Não iniciado", "Em andamento", "Concluída"]}
          directions={["Manter", "Priorizar"]}
        />
      </ToastProvider>
    </NextIntlClientProvider>
  );
}

beforeEach(() => {
  useBoardStore.getState().reset();
  useBoardCollabStore.getState().reset();
  useBoardStore.getState().hydrate(BOARD_ID, structuredClone(minimalBoard));

  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };

  globalThis.IntersectionObserver = class IntersectionObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  } as unknown as typeof IntersectionObserver;

  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/presence")) {
        throw new Error("sse_unavailable_in_test");
      }
      if (url.includes("/nlq")) {
        return new Response(JSON.stringify({ recent: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch
  );
});

afterEach(() => {
  cleanup();
  useBoardStore.getState().reset();
  useBoardCollabStore.getState().reset();
  vi.unstubAllGlobals();
});

describe("KanbanBoard — abertura (smoke)", () => {
  it(
    "renderiza colunas e cards após hidratar o board (sem loop de atualização)",
    async () => {
      render(<BoardHarness />);

      await waitFor(
        () => {
          expect(screen.getByText("Card teste")).toBeTruthy();
        },
        { timeout: 15_000 }
      );

      expect(screen.getAllByText("Backlog").length).toBeGreaterThan(0);
    },
    20_000
  );
});
