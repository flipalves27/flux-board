"use client";

import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";

export type DepGraphNode = {
  id: string;
  boardId: string;
  boardName: string;
  cardId: string;
  title: string;
};

export type DepGraphEdge = {
  source: string;
  target: string;
  kind: string;
  confidence: number;
};

type Props = {
  nodes: DepGraphNode[];
  edges: DepGraphEdge[];
  boardColor: (boardId: string) => string;
};

export function DependencyGraphView({ nodes, edges, boardColor }: Props) {
  const ref = useRef<SVGSVGElement | null>(null);
  const [dim, setDim] = useState({ w: 800, h: 420 });

  useEffect(() => {
    const el = ref.current;
    if (!el || !nodes.length) return;

    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect;
      if (cr && cr.width > 0) {
        setDim({ w: Math.floor(cr.width), h: Math.min(520, Math.max(320, Math.floor(cr.width * 0.45))) });
      }
    });
    ro.observe(el.parentElement || el);
    return () => ro.disconnect();
  }, [nodes.length]);

  useEffect(() => {
    const el = ref.current;
    if (!el || !nodes.length) return;

    const width = dim.w;
    const height = dim.h;

    const svg = d3.select(el);
    svg.selectAll("*").remove();
    svg.attr("viewBox", `0 0 ${width} ${height}`).attr("width", "100%").attr("height", height);

    const gRoot = svg.append("g");

    type SimNode = d3.SimulationNodeDatum & {
      id: string;
      title: string;
      boardId: string;
    };

    const simulationNodes: SimNode[] = nodes.map((n) => ({
      id: n.id,
      title: n.title.length > 42 ? `${n.title.slice(0, 40)}…` : n.title,
      boardId: n.boardId,
    }));

    const idSet = new Set(simulationNodes.map((n) => n.id));
    const linkInput = edges
      .filter((e) => idSet.has(e.source) && idSet.has(e.target))
      .map((e) => ({
        source: e.source,
        target: e.target,
        kind: e.kind,
        confidence: e.confidence,
      }));

    const linkForce = d3
      .forceLink<SimNode, d3.SimulationLinkDatum<SimNode>>(linkInput as d3.SimulationLinkDatum<SimNode>[])
      .id((d) => d.id)
      .distance(90)
      .strength(0.55);

    const sim = d3
      .forceSimulation<SimNode>(simulationNodes)
      .force("link", linkForce)
      .force("charge", d3.forceManyBody().strength(-220))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide().radius(36));

    const link = gRoot
      .append("g")
      .attr("stroke", "var(--flux-chrome-alpha-25)")
      .selectAll("line")
      .data(linkForce.links())
      .join("line")
      .attr("stroke-width", 1.2);

    const node = gRoot.append("g").selectAll("g").data(simulationNodes).join("g");

    node
      .append("circle")
      .attr("r", 14)
      .attr("fill", (d) => boardColor(d.boardId))
      .attr("stroke", "var(--flux-chrome-alpha-25)")
      .attr("stroke-width", 1);

    node
      .append("text")
      .attr("text-anchor", "middle")
      .attr("dy", 28)
      .attr("fill", "var(--flux-text-muted)")
      .attr("font-size", 9)
      .text((d) => d.title);

    sim.on("tick", () => {
      link
        .attr("x1", (d) => (d.source as SimNode).x ?? 0)
        .attr("y1", (d) => (d.source as SimNode).y ?? 0)
        .attr("x2", (d) => (d.target as SimNode).x ?? 0)
        .attr("y2", (d) => (d.target as SimNode).y ?? 0);

      node.attr("transform", (d) => `translate(${d.x ?? 0},${d.y ?? 0})`);
    });

    return () => {
      sim.stop();
    };
  }, [nodes, edges, dim, boardColor]);

  if (!nodes.length) {
    return <p className="text-sm text-[var(--flux-text-muted)]">Sem nós para exibir.</p>;
  }

  return <svg ref={ref} className="min-h-[320px] w-full touch-none" role="img" aria-hidden />;
}
