"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as d3 from "d3";

export type DepGraphNode = {
  id: string;
  boardId: string;
  boardName: string;
  cardId: string;
  title: string;
  riskScore?: number;
  status?: "done" | "blocked" | "active" | "pending";
};

export type DepGraphEdge = {
  source: string;
  target: string;
  kind: string;
  confidence: number;
  isCriticalPath?: boolean;
};

type Props = {
  nodes: DepGraphNode[];
  edges: DepGraphEdge[];
  boardColor: (boardId: string) => string;
  fullscreen?: boolean;
  onToggleFullscreen?: () => void;
};

const STATUS_COLORS: Record<string, string> = {
  done: "var(--flux-success)",
  blocked: "var(--flux-danger)",
  active: "var(--flux-primary)",
  pending: "var(--flux-text-muted)",
};

function getRiskColor(score: number): string {
  if (score >= 71) return "var(--flux-danger)";
  if (score >= 41) return "var(--flux-warning)";
  return "var(--flux-success)";
}

function buildD3Graph(
  el: SVGSVGElement,
  nodes: DepGraphNode[],
  edges: DepGraphEdge[],
  dim: { w: number; h: number },
  boardColor: (boardId: string) => string,
  onNodeClick: (node: DepGraphNode) => void
): () => void {
  const { w: width, h: height } = dim;
  const svg = d3.select(el);
  svg.selectAll("*").remove();
  svg.attr("viewBox", `0 0 ${width} ${height}`).attr("width", "100%").attr("height", height);

  const zoom = d3.zoom<SVGSVGElement, unknown>().scaleExtent([0.3, 3]).on("zoom", (event) => {
    gRoot.attr("transform", event.transform);
  });
  svg.call(zoom as any);

  const gRoot = svg.append("g");

  type SimNode = d3.SimulationNodeDatum & DepGraphNode;
  const simulationNodes: SimNode[] = nodes.map((n) => ({ ...n }));
  const idSet = new Set(simulationNodes.map((n) => n.id));
  const linkInput = edges
    .filter((e) => idSet.has(e.source) && idSet.has(e.target))
    .map((e) => ({ ...e }));

  const linkForce = d3
    .forceLink<SimNode, typeof linkInput[number]>(linkInput as any)
    .id((d) => d.id)
    .distance(110)
    .strength(0.6);

  const sim = d3
    .forceSimulation<SimNode>(simulationNodes)
    .force("link", linkForce)
    .force("charge", d3.forceManyBody().strength(-280))
    .force("center", d3.forceCenter(width / 2, height / 2))
    .force("collision", d3.forceCollide().radius((d) => nodeRadius(d as DepGraphNode) + 4));

  const defs = svg.append("defs");
  defs.append("marker").attr("id", "arrowhead").attr("markerWidth", 10).attr("markerHeight", 7)
    .attr("refX", 22).attr("refY", 3.5).attr("orient", "auto")
    .append("polygon").attr("points", "0 0, 10 3.5, 0 7").attr("fill", "var(--flux-text-muted)");
  defs.append("marker").attr("id", "arrowhead-critical").attr("markerWidth", 10).attr("markerHeight", 7)
    .attr("refX", 22).attr("refY", 3.5).attr("orient", "auto")
    .append("polygon").attr("points", "0 0, 10 3.5, 0 7").attr("fill", "var(--flux-danger)");

  const link = gRoot.append("g").selectAll("line").data(linkForce.links() as any[]).join("line")
    .attr("stroke", (d: any) => d.isCriticalPath ? "var(--flux-danger)" : "var(--flux-chrome-alpha-25)")
    .attr("stroke-width", (d: any) => d.isCriticalPath ? 2.5 : 1.2)
    .attr("stroke-dasharray", (d: any) => d.kind === "related_to" ? "4 2" : null)
    .attr("marker-end", (d: any) => d.isCriticalPath ? "url(#arrowhead-critical)" : "url(#arrowhead)");

  const node = gRoot.append("g").selectAll("g").data(simulationNodes).join("g")
    .attr("cursor", "pointer")
    .call(
      d3.drag<SVGGElement, SimNode>()
        .on("start", (event, d) => {
          if (!event.active) sim.alphaTarget(0.3).restart();
          d.fx = d.x;
          d.fy = d.y;
        })
        .on("drag", (event, d) => {
          d.fx = event.x;
          d.fy = event.y;
        })
        .on("end", (event, d) => {
          if (!event.active) sim.alphaTarget(0);
          d.fx = null;
          d.fy = null;
        }) as any
    )
    .on("click", (_event, d) => onNodeClick(d as DepGraphNode));

  node.append("circle")
    .attr("r", (d) => nodeRadius(d))
    .attr("fill", (d) => d.status ? STATUS_COLORS[d.status] ?? boardColor(d.boardId) : boardColor(d.boardId))
    .attr("stroke", (d) => d.riskScore && d.riskScore > 40 ? getRiskColor(d.riskScore) : "var(--flux-chrome-alpha-25)")
    .attr("stroke-width", (d) => d.riskScore && d.riskScore > 40 ? 2.5 : 1)
    .attr("filter", (d) => d.riskScore && d.riskScore > 70 ? "drop-shadow(0 0 6px var(--flux-danger))" : null);

  node.append("text")
    .attr("text-anchor", "middle")
    .attr("dy", (d) => nodeRadius(d) + 14)
    .attr("fill", "var(--flux-text-muted)")
    .attr("font-size", 9)
    .text((d) => d.title.length > 32 ? `${d.title.slice(0, 30)}…` : d.title);

  node.append("title").text((d) => `${d.title}\n${d.boardName}${d.riskScore !== undefined ? `\nRisco: ${d.riskScore}/100` : ""}`);

  sim.on("tick", () => {
    (link as any)
      .attr("x1", (d: any) => d.source.x ?? 0)
      .attr("y1", (d: any) => d.source.y ?? 0)
      .attr("x2", (d: any) => d.target.x ?? 0)
      .attr("y2", (d: any) => d.target.y ?? 0);
    node.attr("transform", (d) => `translate(${d.x ?? 0},${d.y ?? 0})`);
  });

  return () => sim.stop();
}

function nodeRadius(n: DepGraphNode): number {
  const base = 14;
  if (n.riskScore === undefined) return base;
  return base + Math.floor((n.riskScore / 100) * 8);
}

export function DependencyGraphView({ nodes, edges, boardColor, fullscreen = false, onToggleFullscreen }: Props) {
  const ref = useRef<SVGSVGElement | null>(null);
  const [dim, setDim] = useState({ w: 800, h: 420 });
  const [selectedNode, setSelectedNode] = useState<DepGraphNode | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect;
      if (cr && cr.width > 0) {
        setDim({ w: Math.floor(cr.width), h: fullscreen ? window.innerHeight - 120 : Math.min(520, Math.max(320, Math.floor(cr.width * 0.5))) });
      }
    });
    ro.observe(el.parentElement || el);
    return () => ro.disconnect();
  }, [nodes.length, fullscreen]);

  useEffect(() => {
    const el = ref.current;
    if (!el || !nodes.length) return;
    return buildD3Graph(el, nodes, edges, dim, boardColor, setSelectedNode);
  }, [nodes, edges, dim, boardColor]);

  if (!nodes.length) {
    return <p className="text-sm text-[var(--flux-text-muted)]">Sem nós para exibir.</p>;
  }

  const inner = (
    <div className="relative w-full">
      <svg ref={ref} className="min-h-[320px] w-full touch-none" role="img" aria-label="Grafo de dependências" />
      {onToggleFullscreen && (
        <button
          type="button"
          onClick={onToggleFullscreen}
          className="absolute top-2 right-2 h-7 w-7 rounded-lg border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-card)] text-[var(--flux-text-muted)] flex items-center justify-center hover:border-[var(--flux-primary-alpha-35)] hover:text-[var(--flux-primary-light)] transition-all"
          aria-label={fullscreen ? "Minimizar" : "Tela cheia"}
        >
          {fullscreen ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 9L4 4M4 4v5M4 4h5M15 9l5-5M20 4v5M20 4h-5M9 15l-5 5M4 20h5M4 20v-5M15 15l5 5M20 20h-5M20 20v-5" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5M20 8V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5M20 16v4m0 0h-4m4 0l-5-5" />
            </svg>
          )}
        </button>
      )}
      {selectedNode && (
        <div className="absolute bottom-3 left-3 max-w-[240px] rounded-xl border border-[var(--flux-chrome-alpha-10)] bg-[var(--flux-surface-card)]/95 p-3 shadow-lg">
          <div className="flex items-start justify-between gap-2 mb-1">
            <p className="font-semibold text-xs text-[var(--flux-text)] leading-tight">{selectedNode.title}</p>
            <button type="button" onClick={() => setSelectedNode(null)} className="shrink-0 text-[10px] text-[var(--flux-text-muted)]">✕</button>
          </div>
          <p className="text-[11px] text-[var(--flux-text-muted)]">{selectedNode.boardName}</p>
          {selectedNode.riskScore !== undefined && (
            <p className="text-[11px] mt-1" style={{ color: getRiskColor(selectedNode.riskScore) }}>
              Risco: {selectedNode.riskScore}/100
            </p>
          )}
        </div>
      )}
    </div>
  );

  if (fullscreen) {
    return (
      <div className="fixed inset-0 z-[var(--flux-z-dep-graph)] flex flex-col bg-[var(--flux-surface-card)]">
        <div className="shrink-0 flex items-center justify-between px-6 py-3 border-b border-[var(--flux-chrome-alpha-06)]">
          <h2 className="font-display font-bold text-base text-[var(--flux-text)]">Grafo de Dependências</h2>
          {onToggleFullscreen && (
            <button type="button" onClick={onToggleFullscreen} className="btn-secondary text-sm">Fechar</button>
          )}
        </div>
        <div className="flex-1 min-h-0 p-4">{inner}</div>
      </div>
    );
  }

  return inner;
}
