import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { ChartShell } from "./chart-shell";
import { ApiError } from "@/lib/api-client";

const apiPostMock = vi.fn();

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/context/auth-context", () => ({
  useAuth: () => ({
    getHeaders: () => ({}),
  }),
}));

vi.mock("@/lib/api-client", () => ({
  apiPost: (...args: unknown[]) => apiPostMock(...args),
  ApiError: class ApiError extends Error {},
}));

vi.mock("@/components/ai-model-hint", () => ({
  AiModelHint: ({ model, provider }: { model?: string; provider?: string }) => (
    <div>{`model:${model ?? "none"} provider:${provider ?? "none"}`}</div>
  ),
}));

describe("ChartShell", () => {
  beforeEach(() => {
    apiPostMock.mockReset();
  });

  it("renders title/hint and explains successfully", async () => {
    apiPostMock.mockResolvedValue({
      narrative: "Resumo do grafico",
      model: "gpt-test",
      provider: "openai",
    });

    render(
      <ChartShell title="Throughput" hint="Hint text" chartId="throughput" explainPayload={{ value: 1 }}>
        <div>chart-content</div>
      </ChartShell>
    );

    expect(screen.getByText("Throughput")).toBeTruthy();
    expect(screen.getByText("Hint text")).toBeTruthy();
    expect(screen.getByText("chart-content")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "explain" }));
    await waitFor(() => {
      expect(screen.getByText("Resumo do grafico")).toBeTruthy();
      expect(screen.getByText("model:gpt-test provider:openai")).toBeTruthy();
    });
    expect(apiPostMock).toHaveBeenCalledWith(
      "/api/flux-reports/explain",
      expect.objectContaining({
        chartId: "throughput",
        chartTitle: "Throughput",
        dataSummary: JSON.stringify({ value: 1 }),
      }),
      {}
    );
  });

  it("shows error when explain request fails", async () => {
    apiPostMock.mockRejectedValue(new Error("boom"));

    render(
      <ChartShell title="Lead time" chartId="lead" explainPayload={{ value: 2 }}>
        <div>chart-content</div>
      </ChartShell>
    );

    fireEvent.click(screen.getByRole("button", { name: "explain" }));
    await waitFor(() => {
      expect(screen.getByText("explainError")).toBeTruthy();
    });
  });

  it("shows ApiError message when request fails with ApiError", async () => {
    apiPostMock.mockRejectedValue(new ApiError("quota exceeded"));

    render(
      <ChartShell title="Velocity" chartId="velocity" explainPayload={{ value: 3 }}>
        <div>chart-content</div>
      </ChartShell>
    );

    fireEvent.click(screen.getByRole("button", { name: "explain" }));
    await waitFor(() => {
      expect(screen.getByText("quota exceeded")).toBeTruthy();
    });
  });

  it("shows explaining state while request is in-flight", async () => {
    let resolvePromise: ((value: { narrative: string }) => void) | null = null;
    apiPostMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePromise = resolve as (value: { narrative: string }) => void;
        })
    );

    render(
      <ChartShell title="CFD" chartId="cfd" explainPayload={{ value: 4 }}>
        <div>chart-content</div>
      </ChartShell>
    );

    fireEvent.click(screen.getByRole("button", { name: "explain" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "explaining" })).toBeTruthy();
    });

    resolvePromise?.({ narrative: "ok" });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "explain" })).toBeTruthy();
      expect(screen.getByText("ok")).toBeTruthy();
    });
  });

  it("uses custom explainApiPath when provided", async () => {
    apiPostMock.mockResolvedValue({ narrative: "custom path ok" });

    render(
      <ChartShell
        title="Custom"
        chartId="custom-chart"
        explainPayload={{ cards: 4 }}
        explainApiPath="/api/flux-reports/lss/explain"
      >
        <div>chart-content</div>
      </ChartShell>
    );

    fireEvent.click(screen.getByRole("button", { name: "explain" }));
    await waitFor(() => {
      expect(screen.getByText("custom path ok")).toBeTruthy();
    });
    expect(apiPostMock).toHaveBeenCalledWith(
      "/api/flux-reports/lss/explain",
      expect.objectContaining({
        chartId: "custom-chart",
        dataSummary: JSON.stringify({ cards: 4 }),
      }),
      {}
    );
  });
});

