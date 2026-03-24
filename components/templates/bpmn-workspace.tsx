"use client";

import { useEffect, useMemo, useRef, useState, type DragEvent, type WheelEvent, type PointerEvent } from "react";
import { apiGet, apiPost } from "@/lib/api-client";
import { BoardTemplateExportModal } from "@/components/board/board-template-export-modal";

type Props = {
  getHeaders: () => Record<string, string>;
  isAdmin: boolean;
};

type BpmnModel = {
  version: "bpmn-2.0-lite";
  name: string;
  lanes: Array<{ id: string; label: string; y: number; height: number }>;
  nodes: Array<{ id: string; type: string; label: string; x: number; y: number; laneId?: string; width?: number; height?: number }>;
  edges: Array<{
    id: string;
    sourceId: string;
    targetId: string;
    label?: string;
    sourcePort?: BpmnPort;
    targetPort?: BpmnPort;
    waypoints?: Array<{ x: number; y: number }>;
  }>;
};

type BpmnPort = "north" | "east" | "south" | "west";

const SAMPLE_MD = `# BPMN Template
name: Sales intake flow
version: bpmn-2.0-lite

## Lanes
- sales: Sales
- ops: Operations

## Nodes
- start_1 | start_event | Start | (100,120) | lane:sales
- task_qualify | task | Qualify lead | (260,120) | lane:sales
- gw_approve | exclusive_gateway | Approved? | (430,120) | lane:ops
- end_done | end_event | End | (590,120) | lane:ops

## Edges
- flow_1 | start_1 -> task_qualify |
- flow_2 | task_qualify -> gw_approve |
- flow_3 | gw_approve -> end_done | yes
`;

const GRID_SIZE = 16;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2.2;

export function BpmnWorkspace({ getHeaders, isAdmin }: Props) {
  const [boardId, setBoardId] = useState("");
  const [openPublish, setOpenPublish] = useState(false);
  const [markdown, setMarkdown] = useState(SAMPLE_MD);
  const [xml, setXml] = useState("");
  const [model, setModel] = useState<BpmnModel>({
    version: "bpmn-2.0-lite",
    name: "Sales intake flow",
    lanes: [
      { id: "sales", label: "Sales", y: 12, height: 128 },
      { id: "ops", label: "Operations", y: 152, height: 128 },
    ],
    nodes: [
      { id: "start_1", type: "start_event", label: "Start", x: 130, y: 60, laneId: "sales", width: 88, height: 48 },
      { id: "task_1", type: "task", label: "Qualify lead", x: 300, y: 60, laneId: "sales", width: 120, height: 56 },
      { id: "gw_1", type: "exclusive_gateway", label: "Approved?", x: 490, y: 60, laneId: "sales", width: 108, height: 56 },
      { id: "end_1", type: "end_event", label: "End", x: 680, y: 60, laneId: "sales", width: 88, height: 48 },
    ],
    edges: [
      { id: "flow_1", sourceId: "start_1", targetId: "task_1" },
      { id: "flow_2", sourceId: "task_1", targetId: "gw_1" },
      { id: "flow_3", sourceId: "gw_1", targetId: "end_1", label: "yes" },
    ],
  });
  const [issues, setIssues] = useState<Array<{ severity: "error" | "warning"; message: string }>>([]);
  const [busy, setBusy] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string>("");
  const [edgeFrom, setEdgeFrom] = useState<string>("");
  const [edgeTo, setEdgeTo] = useState<string>("");
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [connectingFromId, setConnectingFromId] = useState<string>("");
  const [connectPreview, setConnectPreview] = useState<{ x: number; y: number } | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string>("");
  const [selectedWaypoint, setSelectedWaypoint] = useState<{ edgeId: string; index: number } | null>(null);
  const [draggingWaypoint, setDraggingWaypoint] = useState<{ edgeId: string; index: number } | null>(null);
  const [editingLabel, setEditingLabel] = useState("");
  const [editingLane, setEditingLane] = useState("");
  const panStartRef = useRef<{ x: number; y: number; originX: number; originY: number } | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);

  const canPublish = useMemo(() => isAdmin && boardId.trim().length > 0 && !!model, [isAdmin, boardId, model]);

  function nodeStyle(type: string): string {
    if (type === "start_event") return "border-emerald-400/50 bg-emerald-500/20";
    if (type === "end_event") return "border-rose-400/50 bg-rose-500/20";
    if (type === "exclusive_gateway") return "border-amber-400/50 bg-amber-500/20";
    if (type === "parallel_gateway") return "border-sky-400/50 bg-sky-500/20";
    return "border-[var(--flux-primary-alpha-25)] bg-[var(--flux-primary-alpha-15)]";
  }

  function snap(v: number): number {
    return Math.round(v / GRID_SIZE) * GRID_SIZE;
  }

  function laneForY(y: number, lanes: BpmnModel["lanes"]): string | undefined {
    const lane = lanes.find((l) => y >= l.y && y <= l.y + l.height);
    return lane?.id;
  }

  function toCanvasCoords(clientX: number, clientY: number): { x: number; y: number } | null {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const localX = clientX - rect.left;
    const localY = clientY - rect.top;
    return {
      x: snap((localX - pan.x) / zoom),
      y: snap((localY - pan.y) / zoom),
    };
  }

  function modelToMarkdown(m: BpmnModel): string {
    const lanes = m.lanes.map((l) => `- ${l.id}: ${l.label}`).join("\n");
    const nodes = m.nodes
      .map((n) => `- ${n.id} | ${n.type} | ${n.label} | (${Math.round(n.x)},${Math.round(n.y)}) | lane:${n.laneId ?? "-"}`)
      .join("\n");
    const edges = m.edges.map((e) => `- ${e.id} | ${e.sourceId} -> ${e.targetId} | ${e.label ?? ""}`).join("\n");
    return `# BPMN Template
name: ${m.name}
version: ${m.version}

## Lanes
${lanes}

## Nodes
${nodes}

## Edges
${edges}
`;
  }

  function modelToXml(m: BpmnModel): string {
    const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    const lanes = m.lanes.map((l) => `<lane id="${esc(l.id)}" label="${esc(l.label)}" />`).join("");
    const nodes = m.nodes
      .map(
        (n) =>
          `<node id="${esc(n.id)}" type="${esc(n.type)}" label="${esc(n.label)}" x="${Math.round(n.x)}" y="${Math.round(n.y)}" laneId="${esc(n.laneId ?? "")}" />`
      )
      .join("");
    const edges = m.edges
      .map((e) => `<edge id="${esc(e.id)}" sourceId="${esc(e.sourceId)}" targetId="${esc(e.targetId)}" label="${esc(e.label ?? "")}" />`)
      .join("");
    return `<?xml version="1.0" encoding="UTF-8"?><bpmnTemplate version="${m.version}" name="${esc(m.name)}"><lanes>${lanes}</lanes><nodes>${nodes}</nodes><edges>${edges}</edges></bpmnTemplate>`;
  }

  function syncCodeFromModel(next: BpmnModel) {
    setMarkdown(modelToMarkdown(next));
    setXml(modelToXml(next));
  }

  async function convert(format: "markdown" | "xml") {
    setBusy(true);
    try {
      const data = await apiPost<{ model: BpmnModel; validation: { issues: Array<{ severity: "error" | "warning"; message: string }> } }>(
        "/api/bpmn/convert",
        { input: format === "markdown" ? markdown : xml, format },
        getHeaders()
      );
      const normalized: BpmnModel = {
        ...data.model,
        lanes: (data.model.lanes || []).map((lane, i) => ({ ...lane, y: lane.y ?? 12 + i * 140, height: lane.height ?? 128 })),
        nodes: (data.model.nodes || []).map((n) => ({ ...n, width: n.width ?? 110, height: n.height ?? 54 })),
      };
      setModel(normalized);
      setIssues(data.validation.issues || []);
      syncCodeFromModel(normalized);
    } finally {
      setBusy(false);
    }
  }

  async function exportBoard(format: "markdown" | "xml") {
    if (!boardId) return;
    setBusy(true);
    try {
      const data = await apiGet<{ content: string }>(`/api/boards/${encodeURIComponent(boardId)}/bpmn-export?format=${format}`, getHeaders());
      if (format === "markdown") setMarkdown(data.content || "");
      else setXml(data.content || "");
    } finally {
      setBusy(false);
    }
  }

  async function importToBoard(format: "markdown" | "xml") {
    if (!boardId) return;
    setBusy(true);
    try {
      await apiPost(
        `/api/boards/${encodeURIComponent(boardId)}/bpmn-import`,
        { format, content: format === "markdown" ? markdown : xml },
        getHeaders()
      );
    } finally {
      setBusy(false);
    }
  }

  function addNode(type: string, x: number, y: number) {
    setModel((prev) => {
      const id = `${type.replace(/[^a-z_]/g, "")}_${Math.random().toString(36).slice(2, 7)}`;
      const laneId = laneForY(y, prev.lanes);
      const next: BpmnModel = {
        ...prev,
        nodes: [
          ...prev.nodes,
          {
            id,
            type,
            label: type.replace(/_/g, " "),
            x,
            y,
            laneId,
            width: type.includes("event") ? 88 : 120,
            height: type.includes("event") ? 48 : 56,
          },
        ],
      };
      syncCodeFromModel(next);
      return next;
    });
  }

  function onDropCanvas(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const type = e.dataTransfer.getData("application/x-bpmn-type");
    const nodeId = e.dataTransfer.getData("application/x-bpmn-node");
    const coords = toCanvasCoords(e.clientX, e.clientY);
    if (!coords) return;
    const x = Math.max(32, coords.x);
    const y = Math.max(24, coords.y);
    if (type) {
      addNode(type, x, y);
      return;
    }
    if (nodeId) {
      setModel((prev) => {
        const laneId = laneForY(y, prev.lanes);
        const next: BpmnModel = {
          ...prev,
          nodes: prev.nodes.map((n) => (n.id === nodeId ? { ...n, x, y, laneId } : n)),
        };
        syncCodeFromModel(next);
        return next;
      });
    }
  }

  function onCanvasWheel(e: WheelEvent<HTMLDivElement>) {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.92 : 1.08;
    setZoom((prev) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Number((prev * factor).toFixed(2)))));
  }

  function onCanvasPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (e.button !== 1 && !e.altKey) return;
    e.preventDefault();
    setIsPanning(true);
    panStartRef.current = { x: e.clientX, y: e.clientY, originX: pan.x, originY: pan.y };
  }

  function onCanvasPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (!isPanning || !panStartRef.current) return;
    const dx = e.clientX - panStartRef.current.x;
    const dy = e.clientY - panStartRef.current.y;
    setPan({ x: panStartRef.current.originX + dx, y: panStartRef.current.originY + dy });
  }

  function onCanvasPointerUp() {
    setIsPanning(false);
    panStartRef.current = null;
  }

  function addEdge() {
    if (!edgeFrom || !edgeTo || edgeFrom === edgeTo) return;
    setModel((prev) => {
      if (prev.edges.some((e) => e.sourceId === edgeFrom && e.targetId === edgeTo)) return prev;
      const next: BpmnModel = {
        ...prev,
        edges: [...prev.edges, { id: `flow_${Math.random().toString(36).slice(2, 7)}`, sourceId: edgeFrom, targetId: edgeTo, waypoints: [] }],
      };
      syncCodeFromModel(next);
      return next;
    });
  }

  function addEdgeDirect(sourceId: string, targetId: string) {
    if (!sourceId || !targetId || sourceId === targetId) return;
    setModel((prev) => {
      if (prev.edges.some((e) => e.sourceId === sourceId && e.targetId === targetId)) return prev;
      const next: BpmnModel = {
        ...prev,
        edges: [...prev.edges, { id: `flow_${Math.random().toString(36).slice(2, 7)}`, sourceId, targetId, waypoints: [] }],
      };
      syncCodeFromModel(next);
      return next;
    });
  }

  function orthogonalPathFromPoints(points: Array<{ x: number; y: number }>): string {
    if (!points.length) return "";
    return `M ${points[0].x} ${points[0].y} ${points.slice(1).map((p) => `L ${p.x} ${p.y}`).join(" ")}`;
  }

  function segmentHitsRect(a: { x: number; y: number }, b: { x: number; y: number }, rect: { left: number; right: number; top: number; bottom: number }): boolean {
    if (a.y === b.y) {
      const y = a.y;
      if (y < rect.top || y > rect.bottom) return false;
      const minX = Math.min(a.x, b.x);
      const maxX = Math.max(a.x, b.x);
      return !(maxX < rect.left || minX > rect.right);
    }
    if (a.x === b.x) {
      const x = a.x;
      if (x < rect.left || x > rect.right) return false;
      const minY = Math.min(a.y, b.y);
      const maxY = Math.max(a.y, b.y);
      return !(maxY < rect.top || minY > rect.bottom);
    }
    return false;
  }

  function applyAutoRouting(
    points: Array<{ x: number; y: number }>,
    edge: { sourceId: string; targetId: string },
    nodes: BpmnModel["nodes"]
  ): Array<{ x: number; y: number }> {
    const obstacles = nodes
      .filter((n) => n.id !== edge.sourceId && n.id !== edge.targetId)
      .map((n) => ({
        left: n.x - 10,
        right: n.x + (n.width ?? 110) + 10,
        top: n.y - 10,
        bottom: n.y + (n.height ?? 54) + 10,
      }));
    let routed = [...points];
    for (let i = 0; i < routed.length - 1; i++) {
      const a = routed[i];
      const b = routed[i + 1];
      for (const rect of obstacles) {
        if (!segmentHitsRect(a, b, rect)) continue;
        if (a.y === b.y) {
          const detourY = Math.abs(a.y - (rect.top - 16)) < Math.abs(a.y - (rect.bottom + 16)) ? rect.top - 16 : rect.bottom + 16;
          routed = [...routed.slice(0, i + 1), { x: a.x, y: detourY }, { x: b.x, y: detourY }, ...routed.slice(i + 1)];
          i += 2;
        } else if (a.x === b.x) {
          const detourX = Math.abs(a.x - (rect.left - 16)) < Math.abs(a.x - (rect.right + 16)) ? rect.left - 16 : rect.right + 16;
          routed = [...routed.slice(0, i + 1), { x: detourX, y: a.y }, { x: detourX, y: b.y }, ...routed.slice(i + 1)];
          i += 2;
        }
        break;
      }
    }
    return routed;
  }

  function buildEdgePoints(
    edge: { sourceId: string; targetId: string; waypoints?: Array<{ x: number; y: number }> },
    byId: Map<string, BpmnModel["nodes"][number]>
  ): Array<{ x: number; y: number }> {
    const a = byId.get(edge.sourceId);
    const b = byId.get(edge.targetId);
    if (!a || !b) return [];
    const startPort = (edge as { sourcePort?: BpmnPort }).sourcePort ?? "east";
    const targetPort = (edge as { targetPort?: BpmnPort }).targetPort ?? "west";
    const anchorForPort = (node: BpmnModel["nodes"][number], port: BpmnPort) => {
      const w = node.width ?? 110;
      const h = node.height ?? 54;
      if (port === "north") return { x: node.x + w / 2, y: node.y };
      if (port === "south") return { x: node.x + w / 2, y: node.y + h };
      if (port === "west") return { x: node.x, y: node.y + h / 2 };
      return { x: node.x + w, y: node.y + h / 2 };
    };
    const start = anchorForPort(a, startPort);
    const end = anchorForPort(b, targetPort);
    const rawWps = Array.isArray(edge.waypoints) ? edge.waypoints : [];
    if (rawWps.length === 0) {
      const midX = snap(start.x + (end.x - start.x) / 2);
      return applyAutoRouting([start, { x: midX, y: start.y }, { x: midX, y: end.y }, end], edge, model.nodes);
    }
    const points: Array<{ x: number; y: number }> = [start];
    for (let i = 0; i < rawWps.length; i++) {
      const wp = rawWps[i];
      const prev = points[points.length - 1];
      const nextAnchor = i === rawWps.length - 1 ? end : rawWps[i + 1];
      const horizontalFirst = Math.abs((nextAnchor?.x ?? end.x) - prev.x) >= Math.abs((nextAnchor?.y ?? end.y) - prev.y);
      if (horizontalFirst) {
        points.push({ x: wp.x, y: prev.y });
        points.push({ x: wp.x, y: wp.y });
      } else {
        points.push({ x: prev.x, y: wp.y });
        points.push({ x: wp.x, y: wp.y });
      }
    }
    const last = points[points.length - 1];
    points.push({ x: last.x, y: end.y });
    points.push(end);
    return applyAutoRouting(points, edge, model.nodes);
  }

  function nearestPort(
    node: BpmnModel["nodes"][number],
    point: { x: number; y: number }
  ): { port: BpmnPort; anchor: { x: number; y: number } } {
    const w = node.width ?? 110;
    const h = node.height ?? 54;
    const ports: Array<{ port: BpmnPort; anchor: { x: number; y: number } }> = [
      { port: "north", anchor: { x: node.x + w / 2, y: node.y } },
      { port: "east", anchor: { x: node.x + w, y: node.y + h / 2 } },
      { port: "south", anchor: { x: node.x + w / 2, y: node.y + h } },
      { port: "west", anchor: { x: node.x, y: node.y + h / 2 } },
    ];
    let best = ports[0];
    let bestDist = Number.POSITIVE_INFINITY;
    for (const p of ports) {
      const dx = p.anchor.x - point.x;
      const dy = p.anchor.y - point.y;
      const d = dx * dx + dy * dy;
      if (d < bestDist) {
        bestDist = d;
        best = p;
      }
    }
    return best;
  }

  function anchorForNodePort(node: BpmnModel["nodes"][number], port: BpmnPort): { x: number; y: number } {
    const w = node.width ?? 110;
    const h = node.height ?? 54;
    if (port === "north") return { x: node.x + w / 2, y: node.y };
    if (port === "south") return { x: node.x + w / 2, y: node.y + h };
    if (port === "west") return { x: node.x, y: node.y + h / 2 };
    return { x: node.x + w, y: node.y + h / 2 };
  }

  function constrainWaypointToOrthogonal(
    edge: BpmnModel["edges"][number],
    waypointIndex: number,
    candidate: { x: number; y: number }
  ): { x: number; y: number } {
    const sourceNode = model.nodes.find((n) => n.id === edge.sourceId);
    const targetNode = model.nodes.find((n) => n.id === edge.targetId);
    if (!sourceNode || !targetNode) return candidate;
    const sourcePort = edge.sourcePort ?? "east";
    const targetPort = edge.targetPort ?? "west";
    const start = anchorForNodePort(sourceNode, sourcePort);
    const end = anchorForNodePort(targetNode, targetPort);
    const wps = Array.isArray(edge.waypoints) ? edge.waypoints : [];
    const prev = waypointIndex > 0 ? wps[waypointIndex - 1] : start;
    const next = waypointIndex < wps.length - 1 ? wps[waypointIndex + 1] : end;
    const snapCandidate = { x: snap(candidate.x), y: snap(candidate.y) };
    const alignXDist = Math.min(Math.abs(snapCandidate.x - prev.x), Math.abs(snapCandidate.x - next.x));
    const alignYDist = Math.min(Math.abs(snapCandidate.y - prev.y), Math.abs(snapCandidate.y - next.y));
    if (alignXDist <= alignYDist) {
      const bestX = Math.abs(snapCandidate.x - prev.x) <= Math.abs(snapCandidate.x - next.x) ? prev.x : next.x;
      return { x: bestX, y: snapCandidate.y };
    }
    const bestY = Math.abs(snapCandidate.y - prev.y) <= Math.abs(snapCandidate.y - next.y) ? prev.y : next.y;
    return { x: snapCandidate.x, y: bestY };
  }

  const edgesWithPoints = (() => {
    const byId = new Map(model.nodes.map((n) => [n.id, n]));
    return model.edges
      .map((e) => {
        const points = buildEdgePoints(e, byId);
        if (!points.length) return null;
        const wps = Array.isArray(e.waypoints) ? e.waypoints : [];
        return { ...e, points, waypoints: wps };
      })
      .filter(Boolean) as Array<{ id: string; points: Array<{ x: number; y: number }>; label?: string; waypoints: Array<{ x: number; y: number }> }>;
  })();

  const connectPreviewLine = useMemo(() => {
    if (!connectingFromId || !connectPreview) return null;
    const from = model.nodes.find((n) => n.id === connectingFromId);
    if (!from) return null;
    const x1 = from.x + (from.width ?? 110);
    const y1 = from.y + (from.height ?? 54) / 2;
    return { x1, y1, x2: connectPreview.x, y2: connectPreview.y };
  }, [connectingFromId, connectPreview, model.nodes]);

  const selectedNode = useMemo(() => model.nodes.find((n) => n.id === selectedNodeId) ?? null, [model.nodes, selectedNodeId]);

  function updateSelectedNode(patch: Partial<BpmnModel["nodes"][number]>) {
    if (!selectedNodeId) return;
    setModel((prev) => {
      const next: BpmnModel = {
        ...prev,
        nodes: prev.nodes.map((n) => (n.id === selectedNodeId ? { ...n, ...patch } : n)),
      };
      syncCodeFromModel(next);
      return next;
    });
  }

  function updateLaneLabel() {
    if (!selectedNode?.laneId || !editingLane.trim()) return;
    setModel((prev) => {
      const next: BpmnModel = {
        ...prev,
        lanes: prev.lanes.map((l) => (l.id === selectedNode.laneId ? { ...l, label: editingLane.trim() } : l)),
      };
      syncCodeFromModel(next);
      return next;
    });
  }

  useEffect(() => {
    const onKeyDown = (ev: KeyboardEvent) => {
      const target = ev.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;

      if (ev.key === "Escape") {
        if (connectingFromId || connectPreview) {
          ev.preventDefault();
          setConnectingFromId("");
          setConnectPreview(null);
          setDraggingWaypoint(null);
        }
        return;
      }

      if (ev.key === "Delete" || ev.key === "Backspace") {
        if (selectedWaypoint) {
          ev.preventDefault();
          setModel((prev) => {
            const next: BpmnModel = {
              ...prev,
              edges: prev.edges.map((ed) => {
                if (ed.id !== selectedWaypoint.edgeId) return ed;
                const wps = (Array.isArray(ed.waypoints) ? ed.waypoints : []).filter((_, i) => i !== selectedWaypoint.index);
                return { ...ed, waypoints: wps };
              }),
            };
            syncCodeFromModel(next);
            return next;
          });
          setSelectedWaypoint(null);
          return;
        }
        if (selectedEdgeId) {
          ev.preventDefault();
          setModel((prev) => {
            const next: BpmnModel = {
              ...prev,
              edges: prev.edges.filter((ed) => ed.id !== selectedEdgeId),
            };
            syncCodeFromModel(next);
            return next;
          });
          setSelectedEdgeId("");
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [connectingFromId, connectPreview, selectedWaypoint, selectedEdgeId, syncCodeFromModel]);

  return (
    <div className="space-y-4">
      <label className="block text-xs font-semibold text-[var(--flux-text-muted)]">Board ID</label>
      <input value={boardId} onChange={(e) => setBoardId(e.target.value)} className="w-full max-w-lg px-3 py-2 rounded-[var(--flux-rad)] bg-[var(--flux-surface-elevated)] border border-[var(--flux-control-border)] text-sm" placeholder="b_123" />
      <div className="grid grid-cols-1 xl:grid-cols-[280px_1fr_300px] gap-4">
        <aside className="rounded-[var(--flux-rad-lg)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)]/40 p-3 space-y-3">
          <p className="text-xs font-semibold text-[var(--flux-text-muted)]">Paleta BPMN (arraste para o canvas)</p>
          <div className="grid grid-cols-2 gap-2">
            {["start_event", "task", "exclusive_gateway", "parallel_gateway", "end_event"].map((type) => (
              <button
                key={type}
                type="button"
                draggable
                onDragStart={(e) => e.dataTransfer.setData("application/x-bpmn-type", type)}
                className={`text-[11px] px-2 py-2 rounded-[var(--flux-rad)] border text-left ${nodeStyle(type)}`}
              >
                {type.replace(/_/g, " ")}
              </button>
            ))}
          </div>
          <div className="space-y-2 pt-1 border-t border-[var(--flux-chrome-alpha-08)]">
            <p className="text-xs font-semibold text-[var(--flux-text-muted)]">Conectar elementos</p>
            <select value={edgeFrom} onChange={(e) => setEdgeFrom(e.target.value)} className="w-full px-2 py-1.5 rounded-[var(--flux-rad)] bg-[var(--flux-surface-elevated)] border border-[var(--flux-control-border)] text-xs">
              <option value="">Origem</option>
              {model.nodes.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.label}
                </option>
              ))}
            </select>
            <select value={edgeTo} onChange={(e) => setEdgeTo(e.target.value)} className="w-full px-2 py-1.5 rounded-[var(--flux-rad)] bg-[var(--flux-surface-elevated)] border border-[var(--flux-control-border)] text-xs">
              <option value="">Destino</option>
              {model.nodes.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.label}
                </option>
              ))}
            </select>
            <button type="button" className="btn-secondary w-full" onClick={addEdge}>
              Criar fluxo
            </button>
          </div>
          {selectedNodeId ? (
            <button
              type="button"
              className="btn-secondary w-full"
              onClick={() =>
                setModel((prev) => {
                  const next: BpmnModel = {
                    ...prev,
                    nodes: prev.nodes.filter((n) => n.id !== selectedNodeId),
                    edges: prev.edges.filter((e) => e.sourceId !== selectedNodeId && e.targetId !== selectedNodeId),
                  };
                  syncCodeFromModel(next);
                  setSelectedNodeId("");
                  return next;
                })
              }
            >
              Remover elemento selecionado
            </button>
          ) : null}
          <p className="text-[11px] text-[var(--flux-text-muted)]">{model.nodes.length} nós • {model.edges.length} fluxos</p>
        </aside>

        <div className="space-y-2">
          <div
            ref={canvasRef}
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDropCanvas}
            onWheel={onCanvasWheel}
            onPointerDown={onCanvasPointerDown}
            onPointerMove={(e) => {
              onCanvasPointerMove(e);
              if (draggingWaypoint) {
                const coords = toCanvasCoords(e.clientX, e.clientY);
                if (!coords) return;
                setModel((prev) => {
                  const next: BpmnModel = {
                    ...prev,
                    edges: prev.edges.map((ed) => {
                      if (ed.id !== draggingWaypoint.edgeId) return ed;
                      const points = Array.isArray(ed.waypoints) ? [...ed.waypoints] : [];
                      points[draggingWaypoint.index] = constrainWaypointToOrthogonal(ed, draggingWaypoint.index, coords);
                      return { ...ed, waypoints: points };
                    }),
                  };
                  syncCodeFromModel(next);
                  return next;
                });
                return;
              }
              if (!connectingFromId) return;
              const coords = toCanvasCoords(e.clientX, e.clientY);
              if (!coords) return;
              setConnectPreview({ x: coords.x, y: coords.y });
            }}
            onPointerUp={() => {
              onCanvasPointerUp();
              if (connectingFromId) {
                setConnectingFromId("");
                setConnectPreview(null);
              }
              if (draggingWaypoint) setDraggingWaypoint(null);
            }}
            onPointerLeave={onCanvasPointerUp}
            className="relative min-h-[320px] rounded-[var(--flux-rad-lg)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-dark)]/55 overflow-hidden"
          >
            <div
              className="absolute inset-0"
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                transformOrigin: "0 0",
                backgroundImage:
                  "linear-gradient(to right, rgba(161,161,170,0.15) 1px, transparent 1px), linear-gradient(to bottom, rgba(161,161,170,0.15) 1px, transparent 1px)",
                backgroundSize: `${GRID_SIZE}px ${GRID_SIZE}px`,
              }}
            >
              {model.lanes.map((lane) => (
                <div
                  key={lane.id}
                  className="absolute left-0 right-0 border-b border-[var(--flux-chrome-alpha-08)]"
                  style={{ top: lane.y, height: lane.height }}
                >
                  <span className="absolute left-2 top-1 text-[10px] font-semibold text-[var(--flux-text-muted)]">{lane.label}</span>
                </div>
              ))}
              <svg className="absolute inset-0 w-full h-full pointer-events-none">
                <defs>
                  <marker id="bpmnArrowHead" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="rgba(161,161,170,0.95)" />
                  </marker>
                  <marker id="bpmnArrowHeadPreview" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="rgba(56,189,248,0.95)" />
                  </marker>
                </defs>
                {edgesWithPoints.map((edge) => (
                  <g key={edge.id}>
                    <path
                      d={orthogonalPathFromPoints(edge.points)}
                      fill="none"
                      stroke={selectedEdgeId === edge.id ? "rgba(56,189,248,0.95)" : "rgba(161,161,170,0.85)"}
                      strokeWidth={2}
                      markerEnd="url(#bpmnArrowHead)"
                      className="pointer-events-auto cursor-pointer"
                      onPointerDown={() => {
                        setSelectedEdgeId(edge.id);
                        setSelectedWaypoint(null);
                      }}
                      onDoubleClick={(ev) => {
                        ev.stopPropagation();
                        const coords = toCanvasCoords(ev.clientX, ev.clientY);
                        if (!coords) return;
                        setModel((prev) => {
                          const next: BpmnModel = {
                            ...prev,
                            edges: prev.edges.map((ed) => {
                              if (ed.id !== edge.id) return ed;
                              const wps = Array.isArray(ed.waypoints) ? [...ed.waypoints] : [];
                              wps.push({ x: snap(coords.x), y: snap(coords.y) });
                              return { ...ed, waypoints: wps };
                            }),
                          };
                          syncCodeFromModel(next);
                          return next;
                        });
                      }}
                    />
                    {selectedEdgeId === edge.id &&
                      edge.waypoints.map((wp, idx) => (
                        <circle
                          key={`${edge.id}_wp_${idx}`}
                          cx={wp.x}
                          cy={wp.y}
                          r={4.5}
                          fill="rgba(56,189,248,0.95)"
                          stroke="rgba(255,255,255,0.9)"
                          strokeWidth={1}
                          className="pointer-events-auto cursor-move"
                          onPointerDown={(ev) => {
                            ev.stopPropagation();
                            setDraggingWaypoint({ edgeId: edge.id, index: idx });
                            setSelectedWaypoint({ edgeId: edge.id, index: idx });
                            setSelectedEdgeId(edge.id);
                          }}
                          onDoubleClick={(ev) => {
                            ev.stopPropagation();
                            setModel((prev) => {
                              const next: BpmnModel = {
                                ...prev,
                                edges: prev.edges.map((ed) => {
                                  if (ed.id !== edge.id) return ed;
                                  const wps = (Array.isArray(ed.waypoints) ? ed.waypoints : []).filter((_, i) => i !== idx);
                                  return { ...ed, waypoints: wps };
                                }),
                              };
                              syncCodeFromModel(next);
                              return next;
                            });
                          }}
                        />
                      ))}
                  </g>
                ))}
                {connectPreviewLine ? (
                  <g>
                    <path
                      d={orthogonalPathFromPoints([
                        { x: connectPreviewLine.x1, y: connectPreviewLine.y1 },
                        { x: snap((connectPreviewLine.x1 + connectPreviewLine.x2) / 2), y: connectPreviewLine.y1 },
                        { x: snap((connectPreviewLine.x1 + connectPreviewLine.x2) / 2), y: connectPreviewLine.y2 },
                        { x: connectPreviewLine.x2, y: connectPreviewLine.y2 },
                      ])}
                      fill="none"
                      stroke="rgba(56,189,248,0.95)"
                      strokeWidth={2}
                      strokeDasharray="6 4"
                      markerEnd="url(#bpmnArrowHeadPreview)"
                    />
                  </g>
                ) : null}
              </svg>
              {model.nodes.map((node) => (
                <button
                  key={node.id}
                  type="button"
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData("application/x-bpmn-node", node.id)}
                  onClick={() => {
                    setSelectedNodeId(node.id);
                    setEditingLabel(node.label);
                    setEditingLane(model.lanes.find((l) => l.id === node.laneId)?.label ?? "");
                  }}
                  onPointerUp={(e) => {
                    if (!connectingFromId) return;
                    e.stopPropagation();
                    const sourceNode = model.nodes.find((n) => n.id === connectingFromId);
                    const targetNode = model.nodes.find((n) => n.id === node.id);
                    if (!sourceNode || !targetNode) return;
                    const source = nearestPort(sourceNode, { x: targetNode.x, y: targetNode.y });
                    const target = nearestPort(targetNode, source.anchor);
                    setModel((prev) => {
                      if (prev.edges.some((ed) => ed.sourceId === connectingFromId && ed.targetId === node.id)) return prev;
                      const next: BpmnModel = {
                        ...prev,
                        edges: [
                          ...prev.edges,
                          {
                            id: `flow_${Math.random().toString(36).slice(2, 7)}`,
                            sourceId: connectingFromId,
                            targetId: node.id,
                            sourcePort: source.port,
                            targetPort: target.port,
                            waypoints: [],
                          } as BpmnModel["edges"][number],
                        ],
                      };
                      syncCodeFromModel(next);
                      return next;
                    });
                    setConnectingFromId("");
                    setConnectPreview(null);
                  }}
                  className={`absolute rounded-[var(--flux-rad)] border px-2 py-1 text-left text-[11px] shadow-sm ${nodeStyle(node.type)} ${
                    selectedNodeId === node.id ? "ring-2 ring-[var(--flux-primary)]" : ""
                  }`}
                  style={{ left: node.x, top: node.y, width: node.width ?? 110, height: node.height ?? 54 }}
                  title="Arraste para reposicionar"
                >
                  <span className="block font-semibold truncate">{node.label}</span>
                  <span className="block text-[10px] opacity-80 truncate">{node.type}</span>
                  <span
                    role="button"
                    aria-label="Criar conexão"
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      const startX = node.x + (node.width ?? 110);
                      const startY = node.y + (node.height ?? 54) / 2;
                      setConnectingFromId(node.id);
                      setConnectPreview({ x: startX, y: startY });
                    }}
                    className="absolute -right-2 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border border-sky-300 bg-sky-400/80"
                  />
                  {(["north", "east", "south", "west"] as const).map((port) => {
                    const w = node.width ?? 110;
                    const h = node.height ?? 54;
                    const style =
                      port === "north"
                        ? { left: w / 2 - 3, top: -5 }
                        : port === "south"
                          ? { left: w / 2 - 3, bottom: -5 }
                          : port === "west"
                            ? { left: -5, top: h / 2 - 3 }
                            : { right: -5, top: h / 2 - 3 };
                    return <span key={`${node.id}_${port}`} className="absolute w-1.5 h-1.5 rounded-full bg-white/85 border border-sky-300/80" style={style} />;
                  })}
                </button>
              ))}
            </div>
            <div className="absolute right-2 top-2 text-[10px] px-2 py-1 rounded bg-black/45 text-white">
              zoom {(zoom * 100).toFixed(0)}% · ALT+drag/middle mouse para pan
            </div>
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn-secondary" onClick={() => setZoom((z) => Math.max(MIN_ZOOM, Number((z - 0.1).toFixed(2))))}>
              Zoom -
            </button>
            <button type="button" className="btn-secondary" onClick={() => setZoom((z) => Math.min(MAX_ZOOM, Number((z + 0.1).toFixed(2))))}>
              Zoom +
            </button>
            <button type="button" className="btn-secondary" onClick={() => setPan({ x: 0, y: 0 })}>
              Reset pan
            </button>
            {selectedEdgeId ? (
              <>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() =>
                    setModel((prev) => {
                      const next: BpmnModel = {
                        ...prev,
                        edges: prev.edges.map((e) => {
                          if (e.id !== selectedEdgeId) return e;
                          const wps = Array.isArray(e.waypoints) ? [...e.waypoints] : [];
                          wps.push({ x: snap((model.nodes[0]?.x ?? 200) + 40), y: snap((model.nodes[0]?.y ?? 120) + 40) });
                          return { ...e, waypoints: wps };
                        }),
                      };
                      syncCodeFromModel(next);
                      return next;
                    })
                  }
                >
                  + Waypoint
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() =>
                    setModel((prev) => {
                      const next: BpmnModel = {
                        ...prev,
                        edges: prev.edges.map((e) => (e.id === selectedEdgeId ? { ...e, waypoints: [] } : e)),
                      };
                      syncCodeFromModel(next);
                      return next;
                    })
                  }
                >
                  Limpar waypoints
                </button>
              </>
            ) : null}
          </div>
          <div className="rounded-[var(--flux-rad)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)]/40 px-3 py-2">
            <p className="text-[10px] font-semibold text-[var(--flux-text-muted)] uppercase tracking-wide">Atalhos</p>
            <p className="text-[11px] text-[var(--flux-text-muted)] mt-1">
              <span className="font-mono">Esc</span> cancela conexão em andamento · <span className="font-mono">Del</span>/<span className="font-mono">Backspace</span> remove waypoint ou edge selecionado.
            </p>
          </div>
          <p className="text-[11px] text-[var(--flux-text-muted)]">Mini-canvas com auto-routing ortogonal, desvio básico de nós e waypoints arrastáveis no edge selecionado.</p>
        </div>

        <aside className="rounded-[var(--flux-rad-lg)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)]/40 p-3 space-y-3">
          <p className="text-xs font-semibold text-[var(--flux-text-muted)]">Propriedades</p>
          {!selectedNode ? (
            <p className="text-xs text-[var(--flux-text-muted)]">Selecione um elemento no canvas para editar propriedades.</p>
          ) : (
            <>
              <div className="space-y-1">
                <label className="text-[11px] text-[var(--flux-text-muted)]">ID</label>
                <input value={selectedNode.id} disabled className="w-full px-2 py-1.5 rounded-[var(--flux-rad)] bg-[var(--flux-surface-dark)] border border-[var(--flux-control-border)] text-xs opacity-80" />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] text-[var(--flux-text-muted)]">Label</label>
                <input
                  value={editingLabel}
                  onChange={(e) => setEditingLabel(e.target.value)}
                  onBlur={() => updateSelectedNode({ label: editingLabel.trim() || selectedNode.label })}
                  className="w-full px-2 py-1.5 rounded-[var(--flux-rad)] bg-[var(--flux-surface-elevated)] border border-[var(--flux-control-border)] text-xs"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[11px] text-[var(--flux-text-muted)]">X</label>
                  <input
                    type="number"
                    value={Math.round(selectedNode.x)}
                    onChange={(e) => updateSelectedNode({ x: snap(Number(e.target.value) || 0) })}
                    className="w-full px-2 py-1.5 rounded-[var(--flux-rad)] bg-[var(--flux-surface-elevated)] border border-[var(--flux-control-border)] text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] text-[var(--flux-text-muted)]">Y</label>
                  <input
                    type="number"
                    value={Math.round(selectedNode.y)}
                    onChange={(e) => updateSelectedNode({ y: snap(Number(e.target.value) || 0) })}
                    className="w-full px-2 py-1.5 rounded-[var(--flux-rad)] bg-[var(--flux-surface-elevated)] border border-[var(--flux-control-border)] text-xs"
                  />
                </div>
              </div>
              {selectedNode.laneId ? (
                <div className="space-y-1">
                  <label className="text-[11px] text-[var(--flux-text-muted)]">Lane</label>
                  <input
                    value={editingLane}
                    onChange={(e) => setEditingLane(e.target.value)}
                    onBlur={updateLaneLabel}
                    className="w-full px-2 py-1.5 rounded-[var(--flux-rad)] bg-[var(--flux-surface-elevated)] border border-[var(--flux-control-border)] text-xs"
                  />
                </div>
              ) : null}
              <button
                type="button"
                className="btn-secondary w-full"
                onClick={() => updateSelectedNode({ type: selectedNode.type === "task" ? "exclusive_gateway" : "task" })}
              >
                Alternar tipo (task/gateway)
              </button>
            </>
          )}
        </aside>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="space-y-2">
          <p className="text-xs font-semibold text-[var(--flux-text-muted)]">Markdown BPMN</p>
          <textarea value={markdown} onChange={(e) => setMarkdown(e.target.value)} rows={16} className="w-full px-3 py-2 rounded-[var(--flux-rad)] bg-[var(--flux-surface-elevated)] border border-[var(--flux-control-border)] text-xs font-mono" />
          <div className="flex gap-2">
            <button type="button" className="btn-secondary" onClick={() => void convert("markdown")} disabled={busy}>Validar Markdown</button>
            <button type="button" className="btn-secondary" onClick={() => void importToBoard("markdown")} disabled={busy || !boardId}>Importar no board</button>
            <button type="button" className="btn-secondary" onClick={() => void exportBoard("markdown")} disabled={busy || !boardId}>Exportar do board</button>
          </div>
        </div>
        <div className="space-y-2">
          <p className="text-xs font-semibold text-[var(--flux-text-muted)]">BPMN XML</p>
          <textarea value={xml} onChange={(e) => setXml(e.target.value)} rows={16} className="w-full px-3 py-2 rounded-[var(--flux-rad)] bg-[var(--flux-surface-elevated)] border border-[var(--flux-control-border)] text-xs font-mono" />
          <div className="flex gap-2">
            <button type="button" className="btn-secondary" onClick={() => void convert("xml")} disabled={busy}>Validar XML</button>
            <button type="button" className="btn-secondary" onClick={() => void importToBoard("xml")} disabled={busy || !boardId}>Importar no board</button>
            <button type="button" className="btn-secondary" onClick={() => void exportBoard("xml")} disabled={busy || !boardId}>Exportar do board</button>
          </div>
        </div>
      </div>
      {issues.length > 0 && (
        <ul className="space-y-1">
          {issues.map((i, idx) => (
            <li key={idx} className={`text-xs ${i.severity === "error" ? "text-[var(--flux-danger)]" : "text-[var(--flux-warning)]"}`}>
              {i.severity.toUpperCase()}: {i.message}
            </li>
          ))}
        </ul>
      )}
      {isAdmin && (
        <div className="pt-2 border-t border-[var(--flux-chrome-alpha-08)]">
          <button type="button" className="btn-primary" disabled={!canPublish} onClick={() => setOpenPublish(true)}>
            Publicar template BPMN
          </button>
        </div>
      )}
      <BoardTemplateExportModal open={openPublish} onClose={() => setOpenPublish(false)} boardId={boardId} getHeaders={getHeaders} defaultTemplateKind="bpmn" />
    </div>
  );
}

