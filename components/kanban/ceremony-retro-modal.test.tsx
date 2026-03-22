/**
 * Regressão: valida correções do React #185 no CeremonyRetroModal.
 *
 * Correções verificadas:
 *  1. useState não pode ser chamado dentro de .map() — violação das regras dos hooks.
 *     Depois da correção, cada coluna é renderizada pelo componente `RetroColumn`,
 *     com useState no topo do componente (hook estável).
 *  2. useCeremonyStore() sem seletor causava re-render a cada mudança do store.
 *     Após a correção, seletores atômicos são usados.
 *  3. getHeaders nas deps do useCallback causava recriações desnecessárias.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup, act, fireEvent } from "@testing-library/react";

// ---------------------------------------------------------------------------
// Mocks de infra
// ---------------------------------------------------------------------------
vi.mock("@/lib/api-client", () => ({
  apiFetch: vi.fn(async (url: string) => {
    if (url.includes("/retrospective")) {
      return new Response(
        JSON.stringify({
          retro: {
            sprintName: "Sprint Alpha",
            summary: "Resumo de teste",
            wentWell: [
              { id: "w1", category: "went_well", text: "Entrega no prazo", votes: 2, aiGenerated: true },
            ],
            improve: [
              { id: "i1", category: "improve", text: "Comunicação", votes: 0, aiGenerated: false },
            ],
            actions: [
              { id: "a1", category: "action", text: "Daily às 9h", votes: 1, aiGenerated: true },
            ],
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }),
  getApiHeaders: (extra?: Record<string, string>) => ({ "Content-Type": "application/json", ...extra }),
}));

vi.mock("@/components/ui/use-modal-a11y", () => ({
  useModalA11y: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Import depois dos mocks
// ---------------------------------------------------------------------------
import CeremonyRetroModal from "./ceremony-retro-modal";
import { useCeremonyStore } from "@/stores/ceremony-store";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function renderModal(open = true) {
  if (open) {
    act(() => {
      useCeremonyStore.getState().openRetro("b_test", "sprint_test");
    });
  }
  return render(<CeremonyRetroModal getHeaders={() => ({})} />);
}

beforeEach(() => {
  // Estado limpo antes de cada teste
  act(() => {
    useCeremonyStore.getState().closeRetro();
  });
});

afterEach(() => {
  cleanup();
  act(() => {
    useCeremonyStore.getState().closeRetro();
  });
});

// ---------------------------------------------------------------------------
// Testes
// ---------------------------------------------------------------------------
describe("CeremonyRetroModal — correções React #185", () => {
  it("não renderiza quando retroModalOpen=false", () => {
    render(<CeremonyRetroModal getHeaders={() => ({})} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renderiza o modal sem lançar erro de hook (useState fora de .map)", async () => {
    // Se useState ainda estivesse dentro do .map(), React lançaria um erro
    // "Rendered more hooks than during the previous render" antes mesmo de montar.
    expect(() => renderModal()).not.toThrow();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("exibe o spinner de carregamento enquanto busca a retrospectiva", () => {
    renderModal();
    // Antes da resposta chegar deve mostrar o spinner
    expect(screen.getByText(/Analisando sprint com IA/i)).toBeTruthy();
  });

  it("renderiza as três colunas da retro após o carregamento", async () => {
    renderModal();

    await waitFor(() => {
      expect(screen.getByText("O que funcionou bem 💚")).toBeTruthy();
      expect(screen.getByText("O que pode melhorar 🔶")).toBeTruthy();
      expect(screen.getByText("Ações concretas ✅")).toBeTruthy();
    });
  });

  it("renderiza os itens de retro em cada coluna", async () => {
    renderModal();

    await waitFor(() => {
      expect(screen.getByText("Entrega no prazo")).toBeTruthy();
      expect(screen.getByText("Comunicação")).toBeTruthy();
      expect(screen.getByText("Daily às 9h")).toBeTruthy();
    });
  });

  it("marca itens gerados por IA com badge 'IA'", async () => {
    renderModal();

    await waitFor(() => {
      // wentWell[0] e actions[0] têm aiGenerated: true
      const iaBadges = screen.getAllByText("IA");
      expect(iaBadges.length).toBeGreaterThanOrEqual(2);
    });
  });

  it("botão Fechar chama closeRetro via seletor atômico", async () => {
    renderModal();

    // Há dois botões "Fechar": ícone (aria-label="Fechar") e rodapé (texto "Fechar")
    // Usar o botão do rodapé — role=button com texto exato
    const closeBtns = screen.getAllByRole("button", { name: /Fechar/i });
    const footerCloseBtn = closeBtns.find((b) => b.textContent?.trim() === "Fechar");
    expect(footerCloseBtn).toBeTruthy();
    act(() => { fireEvent.click(footerCloseBtn!); });

    expect(useCeremonyStore.getState().retroModalOpen).toBe(false);
  });

  it("fecha ao clicar no backdrop", async () => {
    renderModal();

    await waitFor(() => screen.getByRole("dialog"));
    const backdrop = document.querySelector(".fixed.inset-0.z-\\[400\\] > .absolute");
    expect(backdrop).toBeTruthy();
    act(() => { fireEvent.click(backdrop!); });

    expect(useCeremonyStore.getState().retroModalOpen).toBe(false);
  });

  it("re-renderização por mudança externa do store não causa loop", async () => {
    renderModal();
    await waitFor(() => screen.getByText("Retrospectiva IA"));

    let renderCount = 0;
    const orig = useCeremonyStore.subscribe(() => { renderCount++; });

    // Disparar várias mudanças de estado no ceremony store
    act(() => {
      useCeremonyStore.getState().openReview("b_test", "sprint_test");
      useCeremonyStore.getState().closeReview();
    });

    // O componente não deveria travar ou fazer loop
    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeTruthy();
    });

    orig(); // unsubscribe
  });
});
