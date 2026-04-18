"use client";

import { useCallback, useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  MiniMap,
  ConnectionLineType,
  type Connection,
  type OnSelectionChangeParams,
  ReactFlowProvider,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Barlow, Barlow_Condensed } from "next/font/google";

import { bpmnNodeTypes } from "./nodes";
import { bpmnEdgeTypes, BpmnEdgeMarkers } from "./edges";
import { BpmnToolbar } from "./panels/BpmnToolbar";
import { BpmnPalette } from "./panels/BpmnPalette";
import { BpmnProperties } from "./panels/BpmnProperties";
import { BpmnTooltip } from "./panels/BpmnTooltip";
import { useDragFromPalette } from "./hooks/useDragFromPalette";
import { useBpmnKeyboard } from "./hooks/useBpmnKeyboard";
import {
  useBpmnStore,
  uid,
  type BpmnFlowEdge,
  type BpmnEdgeData,
} from "@/stores/bpmn-store";
import type { BpmnEdgeKind } from "@/lib/bpmn-types";
import { apiPost } from "@/lib/api-client";
import { bpmnModelToMarkdown, bpmnModelToXml } from "@/lib/bpmn-io";
import { BoardTemplateExportModal } from "@/components/board/board-template-export-modal";

const barlow = Barlow({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"] });

type Props = {
  getHeaders: () => Record<string, string>;
  isAdmin: boolean;
};

const GRID_SIZE = 20;

function BpmnWorkspaceInner({ getHeaders, isAdmin }: Props) {
  const rf = useReactFlow();
  const {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    addEdge,
    setSelectedNodeIds,
    setSelectedEdgeId,
    selectedNodeIds,
    showEdges,
    snapEnabled,
    paletteCollapsed,
    propertiesVisible,
    presentMode,
    codeVisible,
    setCodeVisible,
    codeTab,
    setCodeTab,
    boardId,
    issues,
    busy,
    setBusy,
    markdown,
    setMarkdown,
    xml,
    setXml,
    pushHistory,
    syncCode,
    toBpmnModel,
    loadFromModel,
    validate,
    reorderLanes,
  } = useBpmnStore();

  const { onDragOver, onDrop } = useDragFromPalette();
  useBpmnKeyboard();

  const [openPublish, setOpenPublish] = useState(false);
  const [tooltipState, setTooltipState] = useState({ text: "", x: 0, y: 0, visible: false });

  const canPublish = useMemo(() => isAdmin && boardId.trim().length > 0, [isAdmin, boardId]);

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;

      const sourceNode = nodes.find((n) => n.id === connection.source);
      const targetNode = nodes.find((n) => n.id === connection.target);
      let kind: BpmnEdgeKind | undefined;
      if (sourceNode?.data.laneId && targetNode?.data.laneId && sourceNode.data.laneId !== targetNode.data.laneId) {
        kind = "cross_lane";
      }

      const edge: BpmnFlowEdge = {
        id: uid("flow"),
        source: connection.source,
        target: connection.target,
        sourceHandle: connection.sourceHandle ?? undefined,
        targetHandle: connection.targetHandle ?? undefined,
        type: "orthogonal",
        data: {
          bpmnKind: kind,
        } satisfies BpmnEdgeData,
      };

      addEdge(edge);
    },
    [addEdge, nodes],
  );

  const isValidConnection = useCallback(
    (connection: Connection | { source: string; target: string }) => {
      if (connection.source === connection.target) return false;
      const sourceNode = nodes.find((n) => n.id === connection.source);
      const targetNode = nodes.find((n) => n.id === connection.target);
      if (targetNode?.data.bpmnType === "start_event") return false;
      if (sourceNode?.data.bpmnType === "end_event") return false;
      return true;
    },
    [nodes],
  );

  const onSelectionChange = useCallback(
    (params: OnSelectionChangeParams) => {
      const nodeIds = params.nodes.map((n) => n.id);
      setSelectedNodeIds(nodeIds);
      const edgeId = params.edges[0]?.id ?? "";
      setSelectedEdgeId(edgeId);
    },
    [setSelectedNodeIds, setSelectedEdgeId],
  );

  const onNodeMouseEnter = useCallback(
    (_: React.MouseEvent, node: (typeof nodes)[number]) => {
      if (node.data.tooltip) {
        setTooltipState({ text: node.data.tooltip, x: 0, y: 0, visible: true });
      }
    },
    [],
  );

  const onNodeMouseMove = useCallback(
    (e: React.MouseEvent) => {
      setTooltipState((prev) => (prev.visible ? { ...prev, x: e.clientX, y: e.clientY } : prev));
    },
    [],
  );

  const onNodeMouseLeave = useCallback(() => {
    setTooltipState({ text: "", x: 0, y: 0, visible: false });
  }, []);

  const onNodeDragStop = useCallback(
    (_: React.MouseEvent, node: (typeof nodes)[number]) => {
      if (node.data.bpmnType === "swim_lane") {
        reorderLanes();
      }
      pushHistory();
      syncCode();
    },
    [pushHistory, syncCode, reorderLanes],
  );

  async function convert(format: "markdown" | "xml") {
    setBusy(true);
    try {
      const data = await apiPost<{ model: Parameters<typeof loadFromModel>[0]; validation: { issues: Array<{ severity: "error" | "warning"; message: string }> } }>(
        "/api/bpmn/convert",
        { input: format === "markdown" ? markdown : xml, format },
        getHeaders(),
      );
      const normalized = {
        ...data.model,
        lanes: (data.model.lanes || []).map((lane, i) => ({ ...lane, y: lane.y ?? 12 + i * 140, height: lane.height ?? 128 })),
        nodes: (data.model.nodes || []).map((n) => ({ ...n, width: n.width ?? 110, height: n.height ?? 54 })),
      };
      loadFromModel(normalized);
    } finally {
      setBusy(false);
    }
  }

  const edgesWithVisibility = useMemo(
    () => edges.map((e) => ({ ...e, hidden: !showEdges })),
    [edges, showEdges],
  );

  return (
    <div className={`${barlow.className} bpmn-workspace flex min-h-0 flex-1 flex-col gap-3 overflow-hidden`}>
      <BpmnToolbar getHeaders={getHeaders} />

      <div
        className={`grid min-h-0 flex-1 gap-3 xl:items-stretch xl:gap-4 ${
          paletteCollapsed && !propertiesVisible
            ? "grid-cols-1 xl:grid-cols-[48px_1fr_48px]"
            : paletteCollapsed
              ? "grid-cols-1 xl:grid-cols-[48px_1fr_260px]"
              : !propertiesVisible
                ? "grid-cols-1 xl:grid-cols-[240px_1fr_48px]"
                : "grid-cols-1 xl:grid-cols-[240px_1fr_260px]"
        }`}
      >
        {/* Left: Palette */}
        <BpmnPalette />

        {/* Center: Canvas */}
        <div className="flex min-h-0 flex-1 flex-col gap-2">
          {!presentMode && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--flux-border-subtle)] bg-[var(--flux-surface-card)] px-3 py-2">
              <button
                type="button"
                className="btn-secondary text-xs"
                onClick={() => useBpmnStore.getState().setSnapEnabled(!snapEnabled)}
              >
                Snap: {snapEnabled ? "ON" : "OFF"}
              </button>
              <span className="text-[11px] text-[var(--flux-text-muted)]">
                Roda: zoom · Alt+arrastar: pan · Área vazia: seleção.
              </span>
            </div>
          )}

          <div className="relative min-h-0 flex-1 overflow-hidden rounded-[var(--flux-rad-lg)] border border-[var(--flux-border-default)] shadow-inner">
            {/* SVG marker defs */}
            <BpmnEdgeMarkers />

            <ReactFlow
              nodes={nodes}
              edges={edgesWithVisibility}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              isValidConnection={isValidConnection}
              onSelectionChange={onSelectionChange}
              onNodeMouseEnter={onNodeMouseEnter}
              onNodeMouseMove={onNodeMouseMove}
              onNodeMouseLeave={onNodeMouseLeave}
              onNodeDragStop={onNodeDragStop}
              onDragOver={onDragOver}
              onDrop={onDrop}
              nodeTypes={bpmnNodeTypes}
              edgeTypes={bpmnEdgeTypes}
              snapToGrid={snapEnabled}
              snapGrid={[GRID_SIZE, GRID_SIZE]}
              fitView
              fitViewOptions={{
                padding: 0.15,
                nodes: nodes.filter((n) => n.data.bpmnType !== "swim_lane"),
              }}
              defaultEdgeOptions={{ type: "orthogonal" }}
              connectionLineType={ConnectionLineType.Step}
              multiSelectionKeyCode="Shift"
              selectionOnDrag
              panOnDrag={[1, 2]}
              deleteKeyCode={null}
              className="bpmn-react-flow"
              proOptions={{ hideAttribution: true }}
            >
              <Background
                variant={BackgroundVariant.Dots}
                gap={GRID_SIZE}
                size={1.2}
                color="var(--bpmn-dots-color, var(--flux-bpmn-grid-dots))"
              />
              <MiniMap
                style={{
                  width: 220,
                  height: 140,
                  borderRadius: "var(--flux-rad)",
                  border: "1px solid var(--flux-border-subtle)",
                  background: "var(--flux-surface-card)",
                }}
                maskColor="var(--flux-minimap-mask)"
                nodeColor={(n) =>
                  selectedNodeIds.includes(n.id)
                    ? "var(--flux-primary)"
                    : "var(--flux-text-muted)"
                }
                pannable
                zoomable
              />
            </ReactFlow>
          </div>

          {/* Shortcuts hint */}
          {!presentMode && (
            <div className="rounded-[var(--flux-rad)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)]/40 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--flux-text-muted)]">Atalhos</p>
              <p className="mt-1 text-[11px] text-[var(--flux-text-muted)]">
                <span className="font-mono">Del</span> remove seleção ·
                <span className="font-mono"> Shift+Click</span> seleção múltipla ·
                <span className="font-mono"> Ctrl+Z/Y</span> desfaz/refaz ·
                <span className="font-mono"> Ctrl+D</span> duplica ·
                <span className="font-mono"> Setas</span> move seleção ·
                <span className="font-mono"> S</span> toggle snap ·
                <span className="font-mono"> [ ]</span> tam. fonte
              </p>
            </div>
          )}
        </div>

        {/* Right: Properties */}
        <BpmnProperties />
      </div>

      {/* Code panel */}
      {!presentMode && (
        <div className="rounded-[var(--flux-rad-lg)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)]/35 p-3 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-[var(--flux-text-muted)]">Modelo de código BPMN</p>
              <p className="text-[11px] text-[var(--flux-text-muted)]">
                Por padrão, o foco fica no board visual. Abra quando quiser validar ou importar/exportar texto.
              </p>
            </div>
            <button type="button" className="btn-secondary" onClick={() => setCodeVisible(!codeVisible)}>
              {codeVisible ? "Esconder modelo" : "Ver modelo"}
            </button>
          </div>
          {codeVisible && (
            <div className="space-y-3">
              <div className="flex gap-2">
                <button
                  type="button"
                  className={`btn-secondary ${codeTab === "markdown" ? "!border-sky-300/60 !bg-sky-500/15" : ""}`}
                  onClick={() => setCodeTab("markdown")}
                >
                  Markdown BPMN
                </button>
                <button
                  type="button"
                  className={`btn-secondary ${codeTab === "xml" ? "!border-sky-300/60 !bg-sky-500/15" : ""}`}
                  onClick={() => setCodeTab("xml")}
                >
                  BPMN XML
                </button>
              </div>
              {codeTab === "markdown" ? (
                <div className="space-y-2">
                  <textarea
                    value={markdown}
                    onChange={(e) => setMarkdown(e.target.value)}
                    rows={12}
                    className="w-full rounded-[var(--flux-rad)] border border-[var(--flux-control-border)] bg-[var(--flux-surface-elevated)] px-3 py-2 font-mono text-xs"
                  />
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className="btn-secondary" onClick={() => void convert("markdown")} disabled={busy}>
                      Validar Markdown
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <textarea
                    value={xml}
                    onChange={(e) => setXml(e.target.value)}
                    rows={12}
                    className="w-full rounded-[var(--flux-rad)] border border-[var(--flux-control-border)] bg-[var(--flux-surface-elevated)] px-3 py-2 font-mono text-xs"
                  />
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className="btn-secondary" onClick={() => void convert("xml")} disabled={busy}>
                      Validar XML
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Validation issues */}
      {issues.length > 0 && (
        <ul className="space-y-1">
          {issues.map((issue, idx) => (
            <li
              key={idx}
              className={`text-xs ${issue.severity === "error" ? "text-[var(--flux-danger)]" : "text-[var(--flux-warning)]"}`}
            >
              {issue.severity.toUpperCase()}: {issue.message}
            </li>
          ))}
        </ul>
      )}

      {/* Publish */}
      {isAdmin && (
        <div className="border-t border-[var(--flux-chrome-alpha-08)] pt-2">
          <button type="button" className="btn-primary" disabled={!canPublish} onClick={() => setOpenPublish(true)}>
            Publicar template BPMN
          </button>
        </div>
      )}
      <BoardTemplateExportModal
        open={openPublish}
        onClose={() => setOpenPublish(false)}
        boardId={boardId}
        getHeaders={getHeaders}
        defaultTemplateKind="bpmn"
      />

      {/* Tooltip */}
      <BpmnTooltip {...tooltipState} />
    </div>
  );
}

/**
 * Wraps the inner workspace with ReactFlowProvider so hooks like
 * useReactFlow() are available inside.
 */
export function BpmnWorkspace(props: Props) {
  return (
    <ReactFlowProvider>
      <BpmnWorkspaceInner {...props} />
    </ReactFlowProvider>
  );
}
