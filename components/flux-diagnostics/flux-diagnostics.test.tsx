import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { FluxDiagnosticsRoot } from "./flux-diagnostics-root";
import { useFluxDiagnosticsStore } from "@/stores/flux-diagnostics-store";

vi.mock("next/navigation", () => {
  const searchParams = new URLSearchParams();
  return {
    usePathname: () => "/pt-BR/board/test",
    useSearchParams: () => searchParams,
  };
});

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: { count?: number }) => {
    if (key === "openButton" && values?.count !== undefined) return `Diagnostics (${values.count})`;
    return key;
  },
}));

vi.mock("@/context/auth-context", () => ({
  useAuth: () => ({
    user: {
      id: "admin",
      username: "admin",
      name: "Admin",
      email: "admin@test.dev",
      isAdmin: false,
      orgId: "org1",
      platformRole: "platform_admin" as const,
      orgRole: "gestor" as const,
    },
    isLoading: false,
    isChecked: true,
    sessionFailure: null,
    login: () => {},
    logout: async () => {},
    setAuth: () => {},
    getHeaders: () => ({}),
    refreshSession: async () => {},
    switchOrganization: async () => false,
  }),
}));

function Boom(): never {
  throw new Error("boom-test");
}

describe("FluxDiagnosticsRoot", () => {
  beforeEach(() => {
    useFluxDiagnosticsStore.getState().clear();
  });

  afterEach(() => {
    cleanup();
    useFluxDiagnosticsStore.getState().clear();
  });

  it("renderiza filhos quando não há erro", () => {
    render(
      <FluxDiagnosticsRoot>
        <div>ok-flux-diag</div>
      </FluxDiagnosticsRoot>
    );
    expect(screen.getByText("ok-flux-diag")).toBeTruthy();
  });

  it("mostra tela de crash e grava entrada no store", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <FluxDiagnosticsRoot>
        <Boom />
      </FluxDiagnosticsRoot>
    );

    expect(screen.getByText(/Erro ao renderizar/i)).toBeTruthy();
    const entries = useFluxDiagnosticsStore.getState().entries;
    expect(entries.some((e) => e.kind === "react-boundary" && e.message.includes("boom-test"))).toBe(true);

    spy.mockRestore();
  });
});
