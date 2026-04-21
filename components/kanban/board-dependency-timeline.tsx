"use client";

import { useEffect, useMemo } from "react";
import {
  Background,
  Controls,
  ReactFlow,
  type Edge,
  type Node,
  useEdgesState,
  useNodesState,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

type CardLike = {
  id: string;
  title: string;
  bucket?: string;
  progress?: string;
  blockedBy?: string[];
};

function buildLayout(cards: CardLike[]): { nodes: Node[]; edges: Edge[] } {
  const involved = new Set<string>();
  const edgePairs: [string, string][] = [];

  for (const c of cards) {
    const bb = Array.isArray(c.blockedBy) ? c.blockedBy : [];
    for (const blockerId of bb) {
      const src = String(blockerId);
      const tgt = String(c.id);
      if (!src || !tgt) continue;
      involved.add(src);
      involved.add(tgt);
      edgePairs.push([src, tgt]);
    }
  }

  const level = new Map<string, number>();
  for (const id of involved) level.set(id, 0);

  for (let iter = 0; iter < involved.size + 2; iter++) {
    for (const [src, tgt] of edgePairs) {
      const next = (level.get(src) ?? 0) + 1;
      if (next > (level.get(tgt) ?? 0)) level.set(tgt, next);
    }
  }

  const byLevel = new Map<number, string[]>();
  for (const id of involved) {
    const lv = level.get(id) ?? 0;
    const arr = byLevel.get(lv) ?? [];
    arr.push(id);
    byLevel.set(lv, arr);
  }

  const cardById = new Map(cards.map((c) => [c.id, c]));
  const nodes: Node[] = [];
  const gapX = 260;
  const gapY = 100;

  for (const [lv, ids] of [...byLevel.entries()].sort((a, b) => a[0] - b[0])) {
    ids.forEach((id, row) => {
      const c = cardById.get(id);
      const label = (c?.title ?? id).slice(0, 48);
      const done = String(c?.progress ?? "") === "Concluída";
      nodes.push({
        id,
        position: { x: lv * gapX, y: row * gapY },
        data: { label },
        type: "default",
        style: {
          fontSize: 11,
          padding: 8,
          borderRadius: 10,
          border: `2px solid ${done ? "var(--flux-success)" : "var(--flux-warning)"}`,
          maxWidth: 220,
          background: "var(--flux-surface-card)",
          color: "var(--flux-text)",
        },
      });
    });
  }

  const edges: Edge[] = edgePairs.map(([src, tgt], i) => {
    const srcCard = cardById.get(src);
    const done = String(srcCard?.progress ?? "") === "Concluída";
    return {
      id: `e${i}-${src}-${tgt}`,
      source: src,
      target: tgt,
      animated: !done,
      style: { stroke: done ? "var(--flux-success)" : "var(--flux-danger)", strokeWidth: 2 },
    };
  });

  return { nodes, edges };
}

export function BoardDependencyTimeline({ cards }: { cards: CardLike[] }) {
  const { nodes: initialNodes, edges: initialEdges } = useMemo(() => buildLayout(cards), [cards]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [initialNodes, initialEdges, setNodes, setEdges]);

  if (!initialNodes.length) {
    return (
      <div className="rounded-xl border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-mid)] p-8 text-center text-sm text-[var(--flux-text-muted)]">
        Nenhuma dependência explícita (`blockedBy`) entre cards deste board. Adicione vínculos no modal do card para ver o mapa.
      </div>
    );
  }

  return (
    <div className="h-[min(560px,70vh)] w-full rounded-xl border border-[var(--flux-chrome-alpha-12)] overflow-hidden bg-[var(--flux-void-nested-36)]">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        fitView
        proOptions={{ hideAttribution: true }}
      >
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  );
}
