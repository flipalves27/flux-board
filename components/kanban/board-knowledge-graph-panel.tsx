"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  ReactFlow,
  Controls,
  MiniMap,
  Background,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeTypes,
  Handle,
  Position,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useModalA11y } from "@/components/ui/use-modal-a11y";

type KGNode = {
  id: string;
  title: string;
  column: string;
  tags: string[];
  priority: string;
};

type KGEdge = {
  source: string;
  target: string;
  similarity: number;
  type: "related" | "duplicate_risk" | "dependency";
};

type KGOutput = {
  nodes: KGNode[];
  edges: KGEdge[];
  clusterCount: number;
  generatedAt: string;
};

export type BoardKnowledgeGraphPanelProps = {
  boardId: string;
  open: boolean;
  onClose: () => void;
};

const COLUMN_PALETTE = [
  "var(--flux-primary)",
  "var(--flux-secondary, #8b5cf6)",
  "#0ea5e9",
  "#f59e0b",
  "#10b981",
  "#ef4444",
  "#ec4899",
  "#6366f1",
  "#14b8a6",
  "#f97316",
];

function truncate(s: string, max: number) {
  return s.length > max ? s.slice(0, max) + "…" : s;
}

function CardNode({ data }: { data: { label: string; color: string; size: number } }) {
  const r = Math.max(20, data.size);
  return (
    <>
      <Handle type="target" position={Position.Left} className="!bg-transparent !border-0 !w-0 !h-0" />
      <div
        className="flex items-center justify-center rounded-full border-2 text-white text-[10px] font-semibold leading-tight text-center px-1 shadow-md"
        style={{
          width: r * 2,
          height: r * 2,
          borderColor: data.color,
          background: `color-mix(in srgb, ${data.color} 75%, transparent)`,
        }}
        title={data.label}
      >
        <span className="line-clamp-3 overflow-hidden">{data.label}</span>
      </div>
      <Handle type="source" position={Position.Right} className="!bg-transparent !border-0 !w-0 !h-0" />
    </>
  );
}

const nodeTypes: NodeTypes = { card: CardNode };

function edgeColor(type: KGEdge["type"]) {
  switch (type) {
    case "duplicate_risk":
      return "var(--flux-danger, #ef4444)";
    case "dependency":
      return "var(--flux-warning, #f59e0b)";
    default:
      return "var(--flux-text-muted, #94a3b8)";
  }
}

function forceLayout(kgNodes: KGNode[], kgEdges: KGEdge[]) {
  const edgeDegree = new Map<string, number>();
  for (const n of kgNodes) edgeDegree.set(n.id, 0);
  for (const e of kgEdges) {
    edgeDegree.set(e.source, (edgeDegree.get(e.source) ?? 0) + 1);
    edgeDegree.set(e.target, (edgeDegree.get(e.target) ?? 0) + 1);
  }

  const positions = new Map<string, { x: number; y: number }>();
  const count = kgNodes.length;
  const radius = Math.max(200, count * 18);

  for (let i = 0; i < count; i++) {
    const angle = (2 * Math.PI * i) / count;
    positions.set(kgNodes[i].id, {
      x: Math.cos(angle) * radius + radius + 60,
      y: Math.sin(angle) * radius + radius + 60,
    });
  }

  const adjMap = new Map<string, Set<string>>();
  for (const n of kgNodes) adjMap.set(n.id, new Set());
  for (const e of kgEdges) {
    adjMap.get(e.source)?.add(e.target);
    adjMap.get(e.target)?.add(e.source);
  }

  const ITERATIONS = 60;
  const REPULSION = 8000;
  const ATTRACTION = 0.004;
  const DAMPING = 0.85;
  const velocities = new Map<string, { vx: number; vy: number }>();
  for (const n of kgNodes) velocities.set(n.id, { vx: 0, vy: 0 });

  for (let iter = 0; iter < ITERATIONS; iter++) {
    for (let i = 0; i < count; i++) {
      const a = kgNodes[i];
      const pa = positions.get(a.id)!;
      const va = velocities.get(a.id)!;

      for (let j = i + 1; j < count; j++) {
        const b = kgNodes[j];
        const pb = positions.get(b.id)!;
        let dx = pa.x - pb.x;
        let dy = pa.y - pb.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = REPULSION / (dist * dist);
        dx = (dx / dist) * force;
        dy = (dy / dist) * force;
        va.vx += dx;
        va.vy += dy;
        const vb = velocities.get(b.id)!;
        vb.vx -= dx;
        vb.vy -= dy;
      }
    }

    for (const e of kgEdges) {
      const pa = positions.get(e.source);
      const pb = positions.get(e.target);
      if (!pa || !pb) continue;
      const dx = pb.x - pa.x;
      const dy = pb.y - pa.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const force = dist * ATTRACTION * e.similarity;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      const va = velocities.get(e.source)!;
      const vb = velocities.get(e.target)!;
      va.vx += fx;
      va.vy += fy;
      vb.vx -= fx;
      vb.vy -= fy;
    }

    for (const n of kgNodes) {
      const v = velocities.get(n.id)!;
      const p = positions.get(n.id)!;
      v.vx *= DAMPING;
      v.vy *= DAMPING;
      p.x += v.vx;
      p.y += v.vy;
    }
  }

  return { positions, edgeDegree };
}

function buildGraph(
  data: KGOutput,
  columnColorMap: Map<string, string>,
  edgeDegree: Map<string, number>,
  positions: Map<string, { x: number; y: number }>,
) {
  const maxDeg = Math.max(1, ...Array.from(edgeDegree.values()));

  const rfNodes: Node[] = data.nodes.map((n) => {
    const deg = edgeDegree.get(n.id) ?? 0;
    const sizeFactor = 20 + (deg / maxDeg) * 22;
    const pos = positions.get(n.id) ?? { x: 0, y: 0 };
    return {
      id: n.id,
      type: "card",
      position: pos,
      data: {
        label: truncate(n.title, 30),
        color: columnColorMap.get(n.column) ?? COLUMN_PALETTE[0],
        size: sizeFactor,
      },
    };
  });

  const rfEdges: Edge[] = data.edges.map((e, i) => ({
    id: `e-${i}`,
    source: e.source,
    target: e.target,
    animated: e.type === "duplicate_risk",
    style: {
      stroke: edgeColor(e.type),
      strokeWidth: 1 + e.similarity * 3,
      opacity: 0.6 + e.similarity * 0.4,
    },
    label: e.type === "duplicate_risk" ? "⚠ dup" : undefined,
    labelStyle: { fontSize: 9, fill: "var(--flux-danger, #ef4444)" },
  }));

  return { rfNodes, rfEdges };
}

export function BoardKnowledgeGraphPanel({
  boardId,
  open,
  onClose,
}: BoardKnowledgeGraphPanelProps) {
  const t = useTranslations("kanban");
  const panelRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  useModalA11y({ open, onClose, containerRef: panelRef, initialFocusRef: closeRef });

  const [graphData, setGraphData] = useState<KGOutput | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchGraph = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/boards/${encodeURIComponent(boardId)}/knowledge-graph`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const json = await res.json();
      setGraphData(json.graph as KGOutput);
    } catch {
      setError(t("board.knowledgeGraph.error"));
    } finally {
      setLoading(false);
    }
  }, [boardId, t]);

  useEffect(() => {
    if (open) fetchGraph();
    if (!open) {
      setGraphData(null);
      setError(null);
    }
  }, [open, fetchGraph]);

  const columnColorMap = useMemo(() => {
    const map = new Map<string, string>();
    if (!graphData) return map;
    const cols = [...new Set(graphData.nodes.map((n) => n.column))];
    cols.forEach((c, i) => map.set(c, COLUMN_PALETTE[i % COLUMN_PALETTE.length]));
    return map;
  }, [graphData]);

  const layout = useMemo(() => {
    if (!graphData || graphData.nodes.length === 0) return null;
    return forceLayout(graphData.nodes, graphData.edges);
  }, [graphData]);

  const { rfNodes: initialNodes, rfEdges: initialEdges } = useMemo(() => {
    if (!graphData || !layout) return { rfNodes: [] as Node[], rfEdges: [] as Edge[] };
    return buildGraph(graphData, columnColorMap, layout.edgeDegree, layout.positions);
  }, [graphData, columnColorMap, layout]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [initialNodes, initialEdges, setNodes, setEdges]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose],
  );

  if (!open) return null;

  const isEmpty = graphData && graphData.nodes.length < 2;

  return (
    <div
      className="fixed inset-0 z-[var(--flux-z-modal-feature)] flex justify-end bg-black/45 backdrop-blur-[1px] motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200"
      onClick={onClose}
      onKeyDown={onKeyDown}
      role="presentation"
    >
      <aside
        ref={panelRef}
        className="h-full w-[min(600px,50vw)] min-w-[320px] border-l border-[var(--flux-border-default)] bg-[var(--flux-surface-card)] shadow-2xl flex flex-col motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-right-4 motion-safe:duration-200"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="knowledge-graph-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-2 border-b border-[var(--flux-border-muted)] px-4 py-3 shrink-0">
          <h2
            id="knowledge-graph-title"
            className="text-sm font-display font-bold text-[var(--flux-text)]"
          >
            {t("board.knowledgeGraph.title")}
          </h2>
          <button
            ref={closeRef}
            type="button"
            className="rounded-lg p-2 text-[var(--flux-text-muted)] hover:bg-[var(--flux-surface-hover)]"
            onClick={onClose}
            aria-label={t("board.flowHealth.close")}
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 flex flex-col">
          {loading && (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-[var(--flux-text-muted)]">
              <svg
                className="h-8 w-8 animate-spin text-[var(--flux-primary)]"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden
              >
                <circle
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeDasharray="31.4 31.4"
                  strokeLinecap="round"
                />
              </svg>
              <span className="text-xs">{t("board.knowledgeGraph.loading")}</span>
            </div>
          )}

          {error && !loading && (
            <div className="flex-1 flex flex-col items-center justify-center gap-3">
              <p className="text-sm text-[var(--flux-danger,#ef4444)]">
                {t("board.knowledgeGraph.error")}
              </p>
              <button
                type="button"
                onClick={fetchGraph}
                className="rounded-lg border border-[var(--flux-primary)] px-4 py-1.5 text-xs font-semibold text-[var(--flux-primary)] hover:bg-[var(--flux-primary-alpha-08)]"
              >
                {t("board.knowledgeGraph.retry")}
              </button>
            </div>
          )}

          {isEmpty && !loading && !error && (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-sm text-[var(--flux-text-muted)]">
                {t("board.knowledgeGraph.empty")}
              </p>
            </div>
          )}

          {graphData && !isEmpty && !loading && !error && (
            <>
              {/* Legend */}
              <div className="flex flex-wrap items-center gap-2 border-b border-[var(--flux-border-muted)] px-4 py-2">
                {[...columnColorMap.entries()].map(([col, color]) => (
                  <span key={col} className="flex items-center gap-1 text-[10px] text-[var(--flux-text-muted)]">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{ background: color }}
                    />
                    {col}
                  </span>
                ))}
                <span className="ml-auto text-[10px] text-[var(--flux-text-muted)] tabular-nums">
                  {graphData.nodes.length} nodes · {graphData.edges.length} edges
                  {graphData.clusterCount > 1
                    ? ` · ${graphData.clusterCount} clusters`
                    : ""}
                </span>
              </div>

              {/* Graph */}
              <div className="flex-1 min-h-0">
                <ReactFlow
                  nodes={nodes}
                  edges={edges}
                  onNodesChange={onNodesChange}
                  onEdgesChange={onEdgesChange}
                  nodeTypes={nodeTypes}
                  fitView
                  minZoom={0.2}
                  maxZoom={3}
                  proOptions={{ hideAttribution: true }}
                  className="bg-[var(--flux-surface-base,#0f1117)]"
                >
                  <Background gap={24} size={1} color="var(--flux-chrome-alpha-08)" />
                  <Controls
                    showInteractive={false}
                    className="!bg-[var(--flux-surface-card)] !border-[var(--flux-border-default)] !shadow-lg [&_button]:!border-[var(--flux-border-muted)] [&_button]:!bg-[var(--flux-surface-elevated)] [&_button]:text-[var(--flux-text)] [&_button:hover]:!bg-[var(--flux-surface-hover)]"
                  />
                  <MiniMap
                    nodeColor={(n) => (n.data as { color: string }).color ?? "#64748b"}
                    maskColor="rgba(0,0,0,0.55)"
                    className="!bg-[var(--flux-surface-elevated)] !border-[var(--flux-border-default)]"
                  />
                </ReactFlow>
              </div>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
