"use client";

import { memo } from "react";
import { useReactFlow } from "@xyflow/react";
import { useBpmnStore } from "@/stores/bpmn-store";
import { apiPost } from "@/lib/api-client";

type Props = {
  getHeaders: () => Record<string, string>;
};

const ZOOM_STEP = 0.15;
const MIN_ZOOM = 0.12;
const MAX_ZOOM = 2.5;

function BpmnToolbarInner({ getHeaders }: Props) {
  const rf = useReactFlow();
  const {
    modelName,
    boardId,
    setBoardId,
    showEdges,
    setShowEdges,
    legendExpanded,
    setLegendExpanded,
    presentMode,
    setPresentMode,
    savingBoard,
    setSavingBoard,
    undo,
    redo,
    toBpmnModel,
  } = useBpmnStore();

  const zoom = rf.getZoom();

  function handleZoomIn() {
    const next = Math.min(MAX_ZOOM, zoom + ZOOM_STEP);
    rf.zoomTo(next, { duration: 200 });
  }

  function handleZoomOut() {
    const next = Math.max(MIN_ZOOM, zoom - ZOOM_STEP);
    rf.zoomTo(next, { duration: 200 });
  }

  function handleReset() {
    rf.setViewport({ x: 40, y: 20, zoom: 1 }, { duration: 300 });
  }

  function handleFitView() {
    rf.fitView({ padding: 0.12, duration: 400 });
  }

  async function handleSave() {
    if (!boardId.trim()) return;
    setSavingBoard(true);
    try {
      const model = toBpmnModel();
      await apiPost(`/api/boards/${boardId.trim()}/bpmn-export`, { model, format: "markdown" }, getHeaders());
    } catch {
      // silently ignore
    } finally {
      setSavingBoard(false);
    }
  }

  return (
    <header
      className="bpmn-toolbar-header flex flex-wrap items-center gap-2 rounded-xl px-3 sm:gap-3 sm:px-4"
      style={{
        background: "var(--bpmn-toolbar-bg)",
        minHeight: presentMode ? 48 : 52,
        padding: presentMode ? "8px 16px" : "10px 16px",
        boxShadow: "0 4px 20px rgba(0,0,0,0.12)",
        borderBottom: "1px solid var(--flux-border-default)",
      }}
    >
      {/* Brand */}
      <span className="font-display text-[22px] font-extrabold uppercase tracking-[2px]" style={{ color: "var(--bpmn-toolbar-text)" }}>
        FLUX <span style={{ color: "var(--flux-primary)" }}>BPMN</span>
      </span>

      <div className="hidden h-7 w-px sm:block" style={{ background: "var(--flux-border-subtle)" }} />
      <span className="max-w-[min(280px,38vw)] truncate text-[13px] font-semibold sm:max-w-[min(380px,45vw)] sm:text-[14px]" style={{ color: "var(--bpmn-toolbar-muted)" }}>
        {modelName}
      </span>

      {/* Board ID */}
      <div className="flex flex-wrap items-center gap-2 pl-2 sm:pl-3" style={{ borderLeft: "1px solid var(--flux-border-subtle)" }}>
        <label htmlFor="bpmn-board-id" className="sr-only">Board ID</label>
        <input
          id="bpmn-board-id"
          value={boardId}
          onChange={(e) => setBoardId(e.target.value)}
          className="w-[min(140px,28vw)] rounded-lg border px-2 py-1.5 text-[12px] focus:outline-none sm:w-40"
          style={{
            borderColor: "var(--flux-control-border)",
            background: "var(--flux-surface-card)",
            color: "var(--flux-text)",
          }}
          placeholder="Board ID"
        />
      </div>

      {/* Controls */}
      <div className="ml-auto flex flex-wrap items-center gap-1.5">
        {/* Zoom */}
        <button type="button" className="bpmn-toolbar-btn" onClick={handleZoomIn}>+</button>
        <span className="min-w-[44px] text-center text-[13px] font-semibold" style={{ color: "var(--bpmn-toolbar-muted)" }}>
          {(zoom * 100).toFixed(0)}%
        </span>
        <button type="button" className="bpmn-toolbar-btn" onClick={handleZoomOut}>−</button>

        <div className="mx-1 hidden h-7 w-px sm:block" style={{ background: "var(--flux-border-subtle)" }} />

        <button type="button" className="bpmn-toolbar-btn" onClick={handleReset}>Reset</button>
        <button type="button" className="bpmn-toolbar-btn" onClick={handleFitView}>Encaixar</button>

        <div className="mx-1 hidden h-7 w-px sm:block" style={{ background: "var(--flux-border-subtle)" }} />

        {/* Toggles */}
        <button
          type="button"
          aria-pressed={showEdges}
          className={`bpmn-toolbar-btn ${showEdges ? "bpmn-toolbar-btn-active" : ""}`}
          onClick={() => setShowEdges(!showEdges)}
        >
          Conexões
        </button>
        <button
          type="button"
          aria-pressed={legendExpanded}
          className={`bpmn-toolbar-btn ${legendExpanded ? "bpmn-toolbar-btn-active" : ""}`}
          onClick={() => setLegendExpanded(!legendExpanded)}
        >
          Legenda
        </button>
        <button
          type="button"
          className={`bpmn-toolbar-btn ${presentMode ? "bpmn-toolbar-btn-active" : ""}`}
          onClick={() => setPresentMode(!presentMode)}
        >
          Apresentação
        </button>

        <div className="mx-1 hidden h-7 w-px sm:block" style={{ background: "var(--flux-border-subtle)" }} />

        {/* Undo / Redo */}
        <button type="button" title="Desfazer (Ctrl+Z)" className="bpmn-toolbar-btn" onClick={undo}>↩</button>
        <button type="button" title="Refazer (Ctrl+Y)" className="bpmn-toolbar-btn" onClick={redo}>↪</button>

        <div className="mx-1 hidden h-7 w-px sm:block" style={{ background: "var(--flux-border-subtle)" }} />

        {/* Save */}
        <button
          type="button"
          disabled={savingBoard || !boardId.trim()}
          className="rounded-lg border border-[var(--flux-primary)] bg-[var(--flux-primary)] px-3 py-1.5 text-[13px] font-semibold text-white shadow-[0_0_12px_rgba(108,92,231,0.35)] transition hover:bg-[var(--flux-primary-light)] disabled:opacity-50"
          onClick={handleSave}
        >
          {savingBoard ? "Salvando…" : "Salvar"}
        </button>
      </div>
    </header>
  );
}

export const BpmnToolbar = memo(BpmnToolbarInner);
