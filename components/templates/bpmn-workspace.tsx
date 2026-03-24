"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type WheelEvent, type PointerEvent, type ReactNode } from "react";
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
type CodeTab = "markdown" | "xml";
type BpmnStencil = {
  type: string;
  label: string;
  hint: string;
  category: "events" | "tasks" | "gateways";
  width: number;
  height: number;
};
type NodeDragState = {
  ids: string[];
  start: { x: number; y: number };
  origins: Record<string, { x: number; y: number }>;
};
type AlignGuide = { axis: "x" | "y"; value: number };
type BoxSelectState = {
  start: { x: number; y: number };
  current: { x: number; y: number };
  additive: boolean;
  baseIds: string[];
};

const BPMN_STENCILS: BpmnStencil[] = [
  { type: "start_event", label: "Start event", hint: "Inicio do processo", category: "events", width: 88, height: 48 },
  { type: "intermediate_event", label: "Intermediate event", hint: "Evento intermediario", category: "events", width: 96, height: 52 },
  { type: "timer_event", label: "Timer event", hint: "Controle por tempo", category: "events", width: 96, height: 52 },
  { type: "message_event", label: "Message event", hint: "Recebe ou envia mensagem", category: "events", width: 96, height: 52 },
  { type: "end_event", label: "End event", hint: "Fim do processo", category: "events", width: 88, height: 48 },
  { type: "task", label: "Task", hint: "Atividade padrao", category: "tasks", width: 124, height: 58 },
  { type: "user_task", label: "User task", hint: "Atividade humana", category: "tasks", width: 134, height: 60 },
  { type: "service_task", label: "Service task", hint: "Automacao sistêmica", category: "tasks", width: 140, height: 60 },
  { type: "script_task", label: "Script task", hint: "Execucao de script", category: "tasks", width: 134, height: 60 },
  { type: "call_activity", label: "Call activity", hint: "Reuso de subprocesso", category: "tasks", width: 146, height: 60 },
  { type: "sub_process", label: "Sub process", hint: "Agrupa macro fluxo", category: "tasks", width: 146, height: 60 },
  { type: "exclusive_gateway", label: "Exclusive gateway", hint: "Decisao unica", category: "gateways", width: 108, height: 58 },
  { type: "parallel_gateway", label: "Parallel gateway", hint: "Execucao paralela", category: "gateways", width: 108, height: 58 },
  { type: "inclusive_gateway", label: "Inclusive gateway", hint: "Uma ou mais saidas", category: "gateways", width: 112, height: 58 },
];

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

const GRID_SIZE = 20;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2.2;
const HISTORY_LIMIT = 80;

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
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
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
  const [isCodeVisible, setIsCodeVisible] = useState(false);
  const [codeTab, setCodeTab] = useState<CodeTab>("markdown");
  const [draggingType, setDraggingType] = useState<string>("");
  const [dragPreview, setDragPreview] = useState<{ x: number; y: number } | null>(null);
  const [isCanvasDropActive, setIsCanvasDropActive] = useState(false);
  const [nodeDrag, setNodeDrag] = useState<NodeDragState | null>(null);
  const [alignGuides, setAlignGuides] = useState<AlignGuide[]>([]);
  const [boxSelect, setBoxSelect] = useState<BoxSelectState | null>(null);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [isPropertiesVisible, setIsPropertiesVisible] = useState(true);
  const panStartRef = useRef<{ x: number; y: number; originX: number; originY: number } | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const modelRef = useRef(model);
  const historyRef = useRef<BpmnModel[]>([model]);
  const historyIndexRef = useRef(0);
  const suppressHistoryRef = useRef(false);
  const clipboardRef = useRef<{
    nodes: BpmnModel["nodes"];
    edges: BpmnModel["edges"];
    pasteCount: number;
  } | null>(null);

  const canPublish = useMemo(() => isAdmin && boardId.trim().length > 0 && !!model, [isAdmin, boardId, model]);

  function nodeStyle(type: string): string {
    if (type === "start_event") return "border-emerald-400/50 bg-emerald-500/20";
    if (type === "end_event") return "border-rose-400/50 bg-rose-500/20";
    if (type === "intermediate_event" || type === "timer_event" || type === "message_event") return "border-fuchsia-400/55 bg-fuchsia-500/20";
    if (type === "exclusive_gateway") return "border-amber-400/50 bg-amber-500/20";
    if (type === "parallel_gateway") return "border-sky-400/50 bg-sky-500/20";
    if (type === "inclusive_gateway") return "border-violet-400/60 bg-violet-500/20";
    if (type === "service_task" || type === "script_task") return "border-cyan-400/55 bg-cyan-500/20";
    if (type === "user_task" || type === "call_activity" || type === "sub_process") return "border-indigo-400/55 bg-indigo-500/20";
    return "border-[var(--flux-primary-alpha-25)] bg-[var(--flux-primary-alpha-15)]";
  }

  function isGatewayType(type: string): boolean {
    return type.includes("gateway");
  }

  function isEventType(type: string): boolean {
    return type.includes("event");
  }

  function markerSvg(type: string): ReactNode {
    if (type === "timer_event") {
      return (
        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 opacity-95" aria-hidden>
          <circle cx="12" cy="13" r="6.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <line x1="12" y1="13" x2="12" y2="9.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          <line x1="12" y1="13" x2="15" y2="14.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          <line x1="9.2" y1="4.4" x2="14.8" y2="4.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      );
    }
    if (type === "message_event") {
      return (
        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 opacity-95" aria-hidden>
          <rect x="5" y="7" width="14" height="10" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path d="M5.8 8 L12 12.7 L18.2 8" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    }
    if (type === "start_event") {
      return (
        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 opacity-95" aria-hidden>
          <polygon points="9,7 17,12 9,17" fill="currentColor" />
        </svg>
      );
    }
    if (type === "end_event") {
      return (
        <svg viewBox="0 0 24 24" className="w-3 h-3 opacity-95" aria-hidden>
          <rect x="7.5" y="7.5" width="9" height="9" fill="currentColor" />
        </svg>
      );
    }
    if (type === "exclusive_gateway") {
      return (
        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 opacity-95" aria-hidden>
          <path d="M8 8 L16 16 M16 8 L8 16" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      );
    }
    if (type === "parallel_gateway") {
      return (
        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 opacity-95" aria-hidden>
          <path d="M12 7 L12 17 M7 12 L17 12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      );
    }
    if (type === "inclusive_gateway") {
      return (
        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 opacity-95" aria-hidden>
          <circle cx="12" cy="12" r="4.5" fill="none" stroke="currentColor" strokeWidth="2" />
        </svg>
      );
    }
    if (type === "service_task") {
      return (
        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 opacity-95" aria-hidden>
          <circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path d="M12 5.5v2.1M12 16.4v2.1M5.5 12h2.1M16.4 12h2.1M7.6 7.6l1.5 1.5M14.9 14.9l1.5 1.5M16.4 7.6l-1.5 1.5M9.1 14.9l-1.5 1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      );
    }
    if (type === "user_task") {
      return (
        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 opacity-95" aria-hidden>
          <circle cx="12" cy="9" r="2.6" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path d="M7.5 17.2c1.2-2.3 2.8-3.5 4.5-3.5s3.3 1.2 4.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      );
    }
    return null;
  }

  function cloneModel(source: BpmnModel): BpmnModel {
    return JSON.parse(JSON.stringify(source)) as BpmnModel;
  }

  function snap(v: number): number {
    return Math.round(v / GRID_SIZE) * GRID_SIZE;
  }

  function laneForY(y: number, lanes: BpmnModel["lanes"]): string | undefined {
    const lane = lanes.find((l) => y >= l.y && y <= l.y + l.height);
    return lane?.id;
  }

  function stencilMeta(type: string): BpmnStencil | undefined {
    return BPMN_STENCILS.find((s) => s.type === type);
  }

  function displayType(type: string): string {
    return stencilMeta(type)?.label ?? type.replace(/_/g, " ");
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

  function alignDeltaForNode(
    node: BpmnModel["nodes"][number],
    others: BpmnModel["nodes"],
    baseDx: number,
    baseDy: number
  ): { dx: number; dy: number; guides: AlignGuide[] } {
    const threshold = 12;
    const width = node.width ?? 110;
    const height = node.height ?? 54;
    const draftLeft = node.x + baseDx;
    const draftTop = node.y + baseDy;
    const draftXPoints = [draftLeft, draftLeft + width / 2, draftLeft + width];
    const draftYPoints = [draftTop, draftTop + height / 2, draftTop + height];

    let bestXDiff = Number.POSITIVE_INFINITY;
    let bestYDiff = Number.POSITIVE_INFINITY;
    let bestXSnap = 0;
    let bestYSnap = 0;
    let guideX: AlignGuide | null = null;
    let guideY: AlignGuide | null = null;

    for (const other of others) {
      const ow = other.width ?? 110;
      const oh = other.height ?? 54;
      const otherXPoints = [other.x, other.x + ow / 2, other.x + ow];
      const otherYPoints = [other.y, other.y + oh / 2, other.y + oh];
      for (const ax of draftXPoints) {
        for (const bx of otherXPoints) {
          const diff = bx - ax;
          const abs = Math.abs(diff);
          if (abs <= threshold && abs < bestXDiff) {
            bestXDiff = abs;
            bestXSnap = diff;
            guideX = { axis: "x", value: snap(bx) };
          }
        }
      }
      for (const ay of draftYPoints) {
        for (const by of otherYPoints) {
          const diff = by - ay;
          const abs = Math.abs(diff);
          if (abs <= threshold && abs < bestYDiff) {
            bestYDiff = abs;
            bestYSnap = diff;
            guideY = { axis: "y", value: snap(by) };
          }
        }
      }
    }

    return {
      dx: baseDx + (Number.isFinite(bestXDiff) ? bestXSnap : 0),
      dy: baseDy + (Number.isFinite(bestYDiff) ? bestYSnap : 0),
      guides: [guideX, guideY].filter(Boolean) as AlignGuide[],
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

  const syncCodeFromModel = useCallback((next: BpmnModel) => {
    setMarkdown(modelToMarkdown(next));
    setXml(modelToXml(next));
  }, []);

  useEffect(() => {
    modelRef.current = model;
    if (suppressHistoryRef.current) {
      suppressHistoryRef.current = false;
      return;
    }
    const stack = historyRef.current;
    const current = stack[historyIndexRef.current];
    const nextSerialized = JSON.stringify(model);
    if (current && JSON.stringify(current) === nextSerialized) return;
    const nextStack = stack.slice(0, historyIndexRef.current + 1);
    nextStack.push(cloneModel(model));
    if (nextStack.length > HISTORY_LIMIT) {
      nextStack.shift();
    }
    historyRef.current = nextStack;
    historyIndexRef.current = nextStack.length - 1;
  }, [model]);

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
      const meta = stencilMeta(type);
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
            width: meta?.width ?? (type.includes("event") ? 88 : 120),
            height: meta?.height ?? (type.includes("event") ? 48 : 56),
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
    setIsCanvasDropActive(false);
    setDragPreview(null);
    setDraggingType("");
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
    if (e.button === 1 || e.altKey) {
      e.preventDefault();
      setIsPanning(true);
      panStartRef.current = { x: e.clientX, y: e.clientY, originX: pan.x, originY: pan.y };
      return;
    }
    if (e.button !== 0) return;
    const coords = toCanvasCoords(e.clientX, e.clientY);
    if (!coords) return;
    const additive = e.shiftKey || e.ctrlKey || e.metaKey;
    setBoxSelect({
      start: coords,
      current: coords,
      additive,
      baseIds: additive ? [...selectedNodeIds] : [],
    });
    if (!additive) {
      setSelectedNodeIds([]);
      setSelectedNodeId("");
    }
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
    setNodeDrag(null);
    setAlignGuides([]);
    setBoxSelect(null);
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
        if (selectedNodeIds.length > 0 || selectedNodeId) {
          const idsToDelete = selectedNodeIds.length > 0 ? selectedNodeIds : [selectedNodeId];
          ev.preventDefault();
          setModel((prev) => {
            const next: BpmnModel = {
              ...prev,
              nodes: prev.nodes.filter((n) => !idsToDelete.includes(n.id)),
              edges: prev.edges.filter((e) => !idsToDelete.includes(e.sourceId) && !idsToDelete.includes(e.targetId)),
            };
            syncCodeFromModel(next);
            return next;
          });
          setSelectedNodeId("");
          setSelectedNodeIds([]);
          return;
        }
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
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "z") {
        ev.preventDefault();
        const canRedo = ev.shiftKey;
        const nextIndex = canRedo ? historyIndexRef.current + 1 : historyIndexRef.current - 1;
        const stack = historyRef.current;
        if (nextIndex < 0 || nextIndex >= stack.length) return;
        historyIndexRef.current = nextIndex;
        const nextModel = cloneModel(stack[nextIndex]);
        suppressHistoryRef.current = true;
        setModel(nextModel);
        syncCodeFromModel(nextModel);
        return;
      }
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "y") {
        ev.preventDefault();
        const nextIndex = historyIndexRef.current + 1;
        const stack = historyRef.current;
        if (nextIndex >= stack.length) return;
        historyIndexRef.current = nextIndex;
        const nextModel = cloneModel(stack[nextIndex]);
        suppressHistoryRef.current = true;
        setModel(nextModel);
        syncCodeFromModel(nextModel);
        return;
      }
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "c") {
        const ids = selectedNodeIds.length > 0 ? selectedNodeIds : selectedNodeId ? [selectedNodeId] : [];
        if (!ids.length) return;
        ev.preventDefault();
        const currentModel = modelRef.current;
        const nodes = currentModel.nodes.filter((n) => ids.includes(n.id)).map((n) => ({ ...n }));
        const edges = currentModel.edges
          .filter((e) => ids.includes(e.sourceId) && ids.includes(e.targetId))
          .map((e) => ({ ...e, waypoints: Array.isArray(e.waypoints) ? e.waypoints.map((wp) => ({ ...wp })) : [] }));
        clipboardRef.current = { nodes, edges, pasteCount: 0 };
        return;
      }
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "v") {
        const clip = clipboardRef.current;
        if (!clip || clip.nodes.length === 0) return;
        ev.preventDefault();
        const step = GRID_SIZE * Math.max(1, (clip.pasteCount ?? 0) + 1);
        setModel((prev) => {
          const idMap = new Map<string, string>();
          const clones = clip.nodes.map((n) => {
            const id = `${n.type.replace(/[^a-z_]/g, "")}_${Math.random().toString(36).slice(2, 7)}`;
            idMap.set(n.id, id);
            const x = Math.max(16, snap(n.x + step));
            const y = Math.max(16, snap(n.y + step));
            return { ...n, id, x, y, laneId: laneForY(y, prev.lanes), label: `${n.label} copy` };
          });
          const clonedEdges = clip.edges.map((e) => ({
            ...e,
            id: `flow_${Math.random().toString(36).slice(2, 7)}`,
            sourceId: idMap.get(e.sourceId) ?? e.sourceId,
            targetId: idMap.get(e.targetId) ?? e.targetId,
          }));
          const next: BpmnModel = {
            ...prev,
            nodes: [...prev.nodes, ...clones],
            edges: [...prev.edges, ...clonedEdges],
          };
          syncCodeFromModel(next);
          setSelectedNodeIds(clones.map((n) => n.id));
          setSelectedNodeId(clones[0]?.id ?? "");
          clipboardRef.current = { ...clip, pasteCount: (clip.pasteCount ?? 0) + 1 };
          return next;
        });
        return;
      }
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "d") {
        const ids = selectedNodeIds.length > 0 ? selectedNodeIds : selectedNodeId ? [selectedNodeId] : [];
        if (!ids.length) return;
        ev.preventDefault();
        setModel((prev) => {
          const clones = prev.nodes
            .filter((n) => ids.includes(n.id))
            .map((n, idx) => {
              const copyId = `${n.type.replace(/[^a-z_]/g, "")}_${Math.random().toString(36).slice(2, 7)}`;
              return {
                ...n,
                id: copyId,
                x: snap(n.x + 40 + idx * 8),
                y: snap(n.y + 40 + idx * 8),
                label: `${n.label} copy`,
              };
            });
          if (!clones.length) return prev;
          const next: BpmnModel = { ...prev, nodes: [...prev.nodes, ...clones] };
          syncCodeFromModel(next);
          setSelectedNodeIds(clones.map((c) => c.id));
          setSelectedNodeId(clones[0]?.id ?? "");
          return next;
        });
      }
      if (!ev.ctrlKey && !ev.metaKey && !ev.altKey && ev.key.startsWith("Arrow")) {
        const ids = selectedNodeIds.length > 0 ? selectedNodeIds : selectedNodeId ? [selectedNodeId] : [];
        if (!ids.length) return;
        ev.preventDefault();
        const distance = ev.shiftKey ? GRID_SIZE * 2 : GRID_SIZE;
        const dx = ev.key === "ArrowRight" ? distance : ev.key === "ArrowLeft" ? -distance : 0;
        const dy = ev.key === "ArrowDown" ? distance : ev.key === "ArrowUp" ? -distance : 0;
        if (!dx && !dy) return;
        setModel((prev) => {
          const next: BpmnModel = {
            ...prev,
            nodes: prev.nodes.map((n) => {
              if (!ids.includes(n.id)) return n;
              const x = Math.max(16, snap(n.x + dx));
              const y = Math.max(16, snap(n.y + dy));
              return { ...n, x, y, laneId: laneForY(y, prev.lanes) };
            }),
          };
          syncCodeFromModel(next);
          return next;
        });
        return;
      }
      if (!ev.ctrlKey && !ev.metaKey && !ev.altKey && !ev.shiftKey && ev.key.toLowerCase() === "s") {
        ev.preventDefault();
        setSnapEnabled((v) => !v);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [connectingFromId, connectPreview, selectedNodeId, selectedNodeIds, selectedWaypoint, selectedEdgeId, syncCodeFromModel]);

  const selectedNodeSet = useMemo(() => new Set(selectedNodeIds), [selectedNodeIds]);
  const boxRect = useMemo(() => {
    if (!boxSelect) return null;
    const left = Math.min(boxSelect.start.x, boxSelect.current.x);
    const top = Math.min(boxSelect.start.y, boxSelect.current.y);
    const width = Math.abs(boxSelect.current.x - boxSelect.start.x);
    const height = Math.abs(boxSelect.current.y - boxSelect.start.y);
    return { left, top, width, height };
  }, [boxSelect]);
  const miniMapBounds = useMemo(() => {
    const minX = Math.min(...model.nodes.map((n) => n.x), 0);
    const minY = Math.min(...model.nodes.map((n) => n.y), 0);
    const maxX = Math.max(...model.nodes.map((n) => n.x + (n.width ?? 110)), 1200);
    const maxY = Math.max(...model.nodes.map((n) => n.y + (n.height ?? 54)), 700);
    return { minX: minX - 80, minY: minY - 60, width: maxX - minX + 160, height: maxY - minY + 120 };
  }, [model.nodes]);

  return (
    <div className="space-y-4">
      <label className="block text-xs font-semibold text-[var(--flux-text-muted)]">Board ID</label>
      <input value={boardId} onChange={(e) => setBoardId(e.target.value)} className="w-full max-w-lg px-3 py-2 rounded-[var(--flux-rad)] bg-[var(--flux-surface-elevated)] border border-[var(--flux-control-border)] text-sm" placeholder="b_123" />
      <div className="grid grid-cols-1 xl:grid-cols-[320px_1fr_300px] gap-4">
        <aside className="rounded-[var(--flux-rad-lg)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)]/50 p-3 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-[var(--flux-text-muted)]">Paleta BPMN</p>
            <span className="text-[10px] text-[var(--flux-text-muted)]">Drag and drop</span>
          </div>
          <p className="text-[11px] text-[var(--flux-text-muted)]">Elementos inspirados em modeladores BPMN internacionais para montar fluxos mais completos.</p>
          {(["events", "tasks", "gateways"] as const).map((group) => (
            <div key={group} className="space-y-2 rounded-[var(--flux-rad)] border border-[var(--flux-chrome-alpha-08)] bg-[var(--flux-surface-dark)]/35 p-2.5">
              <p className="text-[10px] uppercase tracking-wide font-semibold text-[var(--flux-text-muted)]">
                {group === "events" ? "Events" : group === "tasks" ? "Tasks" : "Gateways"}
              </p>
              <div className="grid grid-cols-1 gap-2">
                {BPMN_STENCILS.filter((s) => s.category === group).map((stencil) => (
                  <button
                    key={stencil.type}
                    type="button"
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("application/x-bpmn-type", stencil.type);
                      setDraggingType(stencil.type);
                    }}
                    onDragEnd={() => {
                      setDraggingType("");
                      setIsCanvasDropActive(false);
                      setDragPreview(null);
                    }}
                    className={`text-[11px] px-2 py-2 rounded-[var(--flux-rad)] border text-left transition hover:translate-x-0.5 hover:border-white/25 ${nodeStyle(stencil.type)}`}
                    title={stencil.hint}
                  >
                    <span
                      className={`mb-1 relative inline-flex h-5 w-5 items-center justify-center border border-white/40 ${
                        isGatewayType(stencil.type) ? "rotate-45 rounded-[2px]" : isEventType(stencil.type) ? "rounded-full" : "rounded-[4px]"
                      }`}
                    >
                      {stencil.type === "intermediate_event" ? (
                        <span className="absolute inset-[2px] rounded-full border border-white/40" aria-hidden />
                      ) : null}
                      <span className={`${isGatewayType(stencil.type) ? "-rotate-45" : ""} text-white`}>{markerSvg(stencil.type) ?? <span className="text-[9px] font-semibold">T</span>}</span>
                    </span>
                    <span className="block font-semibold">{stencil.label}</span>
                    <span className="block text-[10px] opacity-80">{stencil.hint}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
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
          <div className="rounded-[var(--flux-rad)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)]/40 px-3 py-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className="btn-secondary" onClick={() => setZoom((z) => Math.max(MIN_ZOOM, Number((z - 0.1).toFixed(2))))}>
                Zoom -
              </button>
              <button type="button" className="btn-secondary" onClick={() => setZoom((z) => Math.min(MAX_ZOOM, Number((z + 0.1).toFixed(2))))}>
                Zoom +
              </button>
              <button type="button" className="btn-secondary" onClick={() => setPan({ x: 0, y: 0 })}>
                Reset pan
              </button>
              <button type="button" className="btn-secondary" onClick={() => setSnapEnabled((v) => !v)}>
                Snap: {snapEnabled ? "ON" : "OFF"}
              </button>
              <span className="text-[11px] text-[var(--flux-text-muted)]">Navegacao: mouse wheel zoom, ALT+drag para pan, clique e arraste vazio para box selection.</span>
            </div>
          </div>
          <div
            ref={canvasRef}
            onDragEnter={(e) => {
              e.preventDefault();
              if (!draggingType) return;
              setIsCanvasDropActive(true);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              if (!draggingType) return;
              const coords = toCanvasCoords(e.clientX, e.clientY);
              if (!coords) return;
              setIsCanvasDropActive(true);
              setDragPreview({ x: Math.max(32, coords.x), y: Math.max(24, coords.y) });
            }}
            onDragLeave={() => {
              setIsCanvasDropActive(false);
              setDragPreview(null);
            }}
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
              if (nodeDrag) {
                const coords = toCanvasCoords(e.clientX, e.clientY);
                if (!coords) return;
                const baseDx = snap(coords.x - nodeDrag.start.x);
                const baseDy = snap(coords.y - nodeDrag.start.y);
                setModel((prev) => {
                  const moving = prev.nodes.find((n) => n.id === nodeDrag.ids[0]);
                  if (!moving) return prev;
                  const others = prev.nodes.filter((n) => !nodeDrag.ids.includes(n.id));
                  const aligned = snapEnabled
                    ? alignDeltaForNode(moving, others, baseDx, baseDy)
                    : { dx: baseDx, dy: baseDy, guides: [] as AlignGuide[] };
                  setAlignGuides(snapEnabled ? aligned.guides : []);
                  const next: BpmnModel = {
                    ...prev,
                    nodes: prev.nodes.map((n) => {
                      if (!nodeDrag.ids.includes(n.id)) return n;
                      const origin = nodeDrag.origins[n.id];
                      const x = Math.max(16, snap(origin.x + aligned.dx));
                      const y = Math.max(16, snap(origin.y + aligned.dy));
                      return { ...n, x, y, laneId: laneForY(y, prev.lanes) };
                    }),
                  };
                  syncCodeFromModel(next);
                  return next;
                });
                return;
              }
              if (boxSelect) {
                const coords = toCanvasCoords(e.clientX, e.clientY);
                if (!coords) return;
                const nextBox = { ...boxSelect, current: coords };
                setBoxSelect(nextBox);
                const left = Math.min(nextBox.start.x, nextBox.current.x);
                const right = Math.max(nextBox.start.x, nextBox.current.x);
                const top = Math.min(nextBox.start.y, nextBox.current.y);
                const bottom = Math.max(nextBox.start.y, nextBox.current.y);
                const hits = model.nodes
                  .filter((n) => {
                    const nx1 = n.x;
                    const ny1 = n.y;
                    const nx2 = n.x + (n.width ?? 110);
                    const ny2 = n.y + (n.height ?? 54);
                    return nx1 <= right && nx2 >= left && ny1 <= bottom && ny2 >= top;
                  })
                  .map((n) => n.id);
                const merged = nextBox.additive ? Array.from(new Set([...nextBox.baseIds, ...hits])) : hits;
                setSelectedNodeIds(merged);
                setSelectedNodeId(merged[0] ?? "");
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
              if (nodeDrag) setNodeDrag(null);
            }}
            onPointerLeave={onCanvasPointerUp}
            className={`relative min-h-[760px] rounded-[var(--flux-rad-lg)] border bg-[var(--flux-surface-dark)]/55 overflow-hidden transition ${
              isCanvasDropActive ? "border-sky-300/70 shadow-[0_0_0_2px_rgba(56,189,248,0.18)]" : "border-[var(--flux-chrome-alpha-12)]"
            }`}
          >
            <div
              className="absolute inset-0"
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                transformOrigin: "0 0",
                backgroundImage:
                  "linear-gradient(to right, rgba(161,161,170,0.16) 1px, transparent 1px), linear-gradient(to bottom, rgba(161,161,170,0.16) 1px, transparent 1px), linear-gradient(to right, rgba(56,189,248,0.2) 1px, transparent 1px), linear-gradient(to bottom, rgba(56,189,248,0.2) 1px, transparent 1px)",
                backgroundSize: `${GRID_SIZE}px ${GRID_SIZE}px, ${GRID_SIZE}px ${GRID_SIZE}px, ${GRID_SIZE * 5}px ${GRID_SIZE * 5}px, ${GRID_SIZE * 5}px ${GRID_SIZE * 5}px`,
                backgroundPosition: "0 0, 0 0, 0 0, 0 0",
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
                  onClick={(e) => {
                    if (e.ctrlKey || e.metaKey || e.shiftKey) {
                      setSelectedNodeIds((prev) => (prev.includes(node.id) ? prev.filter((id) => id !== node.id) : [...prev, node.id]));
                    } else {
                      setSelectedNodeIds([node.id]);
                    }
                    setSelectedNodeId(node.id);
                    setEditingLabel(node.label);
                    setEditingLane(model.lanes.find((l) => l.id === node.laneId)?.label ?? "");
                  }}
                  onPointerDown={(e) => {
                    if (connectingFromId) return;
                    if (e.button !== 0) return;
                    e.stopPropagation();
                    const coords = toCanvasCoords(e.clientX, e.clientY);
                    if (!coords) return;
                    const baseSelection =
                      e.shiftKey || e.ctrlKey || e.metaKey
                        ? selectedNodeSet.has(node.id)
                          ? selectedNodeIds.filter((id) => id !== node.id)
                          : [...selectedNodeIds, node.id]
                        : selectedNodeIds.length > 0 && selectedNodeSet.has(node.id)
                          ? selectedNodeIds
                          : [node.id];
                    const ids = baseSelection.length > 0 ? baseSelection : [node.id];
                    setSelectedNodeIds(ids);
                    setSelectedNodeId(node.id);
                    const origins: Record<string, { x: number; y: number }> = {};
                    for (const id of ids) {
                      const found = model.nodes.find((n) => n.id === id);
                      if (found) origins[id] = { x: found.x, y: found.y };
                    }
                    setNodeDrag({ ids, start: coords, origins });
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
                  className={`absolute px-2 py-1 text-left text-[11px] shadow-sm transition hover:scale-[1.02] hover:shadow-md ${
                    selectedNodeSet.has(node.id) || selectedNodeId === node.id ? "ring-2 ring-[var(--flux-primary)]" : ""
                  }`}
                  style={{ left: node.x, top: node.y, width: node.width ?? 110, height: node.height ?? 54 }}
                  title="Arraste para reposicionar"
                >
                  <span
                    className={`absolute inset-0 ${node.type === "end_event" ? "border-2" : "border"} ${nodeStyle(node.type)} ${
                      isGatewayType(node.type) ? "rotate-45 rounded-[4px]" : isEventType(node.type) ? "rounded-full" : "rounded-[var(--flux-rad)]"
                    }`}
                  />
                  {node.type === "intermediate_event" ? (
                    <span className="pointer-events-none absolute inset-[4px] rounded-full border border-white/45" aria-hidden />
                  ) : null}
                  <span
                    className={`pointer-events-none absolute left-1/2 top-[43%] -translate-x-1/2 -translate-y-1/2 text-white ${
                      isGatewayType(node.type) || isEventType(node.type) || node.type === "service_task" || node.type === "user_task" ? (isGatewayType(node.type) ? "-rotate-45" : "") : "hidden"
                    }`}
                    aria-hidden
                  >
                    {markerSvg(node.type)}
                  </span>
                  {node.type === "sub_process" ? (
                    <span className="pointer-events-none absolute left-1/2 bottom-[3px] -translate-x-1/2 inline-flex h-3.5 w-3.5 items-center justify-center rounded-[2px] border border-white/75 bg-black/20 text-white">
                      <svg viewBox="0 0 24 24" className="w-2.5 h-2.5 opacity-95" aria-hidden>
                        <path d="M12 6.5v11M6.5 12h11" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
                      </svg>
                    </span>
                  ) : null}
                  <span className={`relative block font-semibold truncate ${isGatewayType(node.type) ? "-rotate-45" : ""}`}>{node.label}</span>
                  <span className={`relative block text-[10px] opacity-80 truncate ${isGatewayType(node.type) ? "-rotate-45" : ""}`}>{displayType(node.type)}</span>
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
              {alignGuides.map((guide, idx) =>
                guide.axis === "x" ? (
                  <div key={`gx_${idx}`} className="absolute top-0 bottom-0 w-px bg-sky-300/70" style={{ left: guide.value }} />
                ) : (
                  <div key={`gy_${idx}`} className="absolute left-0 right-0 h-px bg-sky-300/70" style={{ top: guide.value }} />
                )
              )}
              {boxRect ? (
                <div
                  className="absolute border border-sky-300/90 bg-sky-400/15 pointer-events-none"
                  style={{ left: boxRect.left, top: boxRect.top, width: boxRect.width, height: boxRect.height }}
                />
              ) : null}
              {dragPreview && draggingType ? (
                <div
                  className={`pointer-events-none absolute rounded-[var(--flux-rad)] border border-dashed border-sky-300/90 bg-sky-500/15 px-2 py-1 text-[11px] text-sky-100`}
                  style={{
                    left: dragPreview.x,
                    top: dragPreview.y,
                    width: stencilMeta(draggingType)?.width ?? 120,
                    height: stencilMeta(draggingType)?.height ?? 56,
                  }}
                >
                  <span className="font-semibold">{displayType(draggingType)}</span>
                </div>
              ) : null}
            </div>
            <div className="absolute right-2 top-2 text-[10px] px-2 py-1 rounded bg-black/45 text-white">
              zoom {(zoom * 100).toFixed(0)}% · ALT+drag/middle mouse para pan
            </div>
            {isCanvasDropActive ? (
              <div className="absolute left-3 top-3 rounded bg-sky-500/20 border border-sky-300/50 px-2 py-1 text-[10px] text-sky-100">
                Solte para adicionar no board
              </div>
            ) : null}
            <div className="absolute right-3 bottom-3 w-[220px] h-[140px] rounded border border-[var(--flux-chrome-alpha-12)] bg-black/45 p-1.5">
              <div
                className="relative w-full h-full rounded bg-[var(--flux-surface-dark)]/75 cursor-pointer overflow-hidden"
                onClick={(e) => {
                  const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                  const rx = (e.clientX - rect.left) / rect.width;
                  const ry = (e.clientY - rect.top) / rect.height;
                  const worldX = miniMapBounds.minX + rx * miniMapBounds.width;
                  const worldY = miniMapBounds.minY + ry * miniMapBounds.height;
                  const canvasRect = canvasRef.current?.getBoundingClientRect();
                  if (!canvasRect) return;
                  setPan({
                    x: Math.round(canvasRect.width / 2 - worldX * zoom),
                    y: Math.round(canvasRect.height / 2 - worldY * zoom),
                  });
                }}
              >
                {model.nodes.map((n) => {
                  const nx = ((n.x - miniMapBounds.minX) / miniMapBounds.width) * 100;
                  const ny = ((n.y - miniMapBounds.minY) / miniMapBounds.height) * 100;
                  const nw = (((n.width ?? 110) / miniMapBounds.width) * 100);
                  const nh = (((n.height ?? 54) / miniMapBounds.height) * 100);
                  return (
                    <span
                      key={`mini_${n.id}`}
                      className={`absolute rounded-sm ${selectedNodeSet.has(n.id) ? "bg-sky-300/85" : "bg-white/55"}`}
                      style={{ left: `${nx}%`, top: `${ny}%`, width: `${Math.max(nw, 1.5)}%`, height: `${Math.max(nh, 1.5)}%` }}
                    />
                  );
                })}
                {canvasRef.current ? (
                  <div
                    className="absolute border border-sky-300/80 bg-sky-400/10 pointer-events-none"
                    style={{
                      left: `${(((0 - pan.x) / zoom - miniMapBounds.minX) / miniMapBounds.width) * 100}%`,
                      top: `${(((0 - pan.y) / zoom - miniMapBounds.minY) / miniMapBounds.height) * 100}%`,
                      width: `${(((canvasRef.current.getBoundingClientRect().width / zoom) / miniMapBounds.width) * 100)}%`,
                      height: `${(((canvasRef.current.getBoundingClientRect().height / zoom) / miniMapBounds.height) * 100)}%`,
                    }}
                  />
                ) : null}
              </div>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
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
              <span className="font-mono">Esc</span> cancela conexão em andamento · <span className="font-mono">Shift/Ctrl/Cmd+Click</span> seleção múltipla · <span className="font-mono">drag vazio</span> box selection · <span className="font-mono">Setas</span> movem seleção · <span className="font-mono">Ctrl/Cmd + C / V</span> copia e cola · <span className="font-mono">Ctrl/Cmd + Z / Y</span> desfaz e refaz · <span className="font-mono">S</span> alterna snap magnético · <span className="font-mono">Del</span>/<span className="font-mono">Backspace</span> remove seleção · <span className="font-mono">Ctrl/Cmd + D</span> duplica nó(s).
            </p>
          </div>
          <p className="text-[11px] text-[var(--flux-text-muted)]">Canvas interativo com auto-routing ortogonal, desvio de obstáculos e feedback visual de arraste.</p>
        </div>

        <aside className="rounded-[var(--flux-rad-lg)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)]/40 p-3 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-[var(--flux-text-muted)]">Propriedades</p>
            <button type="button" className="btn-secondary" onClick={() => setIsPropertiesVisible((v) => !v)}>
              {isPropertiesVisible ? "Esconder" : "Mostrar"}
            </button>
          </div>
          {!isPropertiesVisible ? (
            <p className="text-xs text-[var(--flux-text-muted)]">Painel oculto para ampliar a area visual do diagrama.</p>
          ) : !selectedNode ? (
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

      <div className="rounded-[var(--flux-rad-lg)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)]/35 p-3 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-[var(--flux-text-muted)]">Modelo de código BPMN</p>
            <p className="text-[11px] text-[var(--flux-text-muted)]">Por padrao, o foco fica no board visual. Abra quando quiser validar ou importar/exportar texto.</p>
          </div>
          <button type="button" className="btn-secondary" onClick={() => setIsCodeVisible((v) => !v)}>
            {isCodeVisible ? "Esconder modelo" : "Ver modelo"}
          </button>
        </div>
        {isCodeVisible ? (
          <div className="space-y-3">
            <div className="flex gap-2">
              <button type="button" className={`btn-secondary ${codeTab === "markdown" ? "!border-sky-300/60 !bg-sky-500/15" : ""}`} onClick={() => setCodeTab("markdown")}>
                Markdown BPMN
              </button>
              <button type="button" className={`btn-secondary ${codeTab === "xml" ? "!border-sky-300/60 !bg-sky-500/15" : ""}`} onClick={() => setCodeTab("xml")}>
                BPMN XML
              </button>
            </div>
            {codeTab === "markdown" ? (
              <div className="space-y-2">
                <textarea value={markdown} onChange={(e) => setMarkdown(e.target.value)} rows={12} className="w-full px-3 py-2 rounded-[var(--flux-rad)] bg-[var(--flux-surface-elevated)] border border-[var(--flux-control-border)] text-xs font-mono" />
                <div className="flex gap-2 flex-wrap">
                  <button type="button" className="btn-secondary" onClick={() => void convert("markdown")} disabled={busy}>Validar Markdown</button>
                  <button type="button" className="btn-secondary" onClick={() => void importToBoard("markdown")} disabled={busy || !boardId}>Importar no board</button>
                  <button type="button" className="btn-secondary" onClick={() => void exportBoard("markdown")} disabled={busy || !boardId}>Exportar do board</button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <textarea value={xml} onChange={(e) => setXml(e.target.value)} rows={12} className="w-full px-3 py-2 rounded-[var(--flux-rad)] bg-[var(--flux-surface-elevated)] border border-[var(--flux-control-border)] text-xs font-mono" />
                <div className="flex gap-2 flex-wrap">
                  <button type="button" className="btn-secondary" onClick={() => void convert("xml")} disabled={busy}>Validar XML</button>
                  <button type="button" className="btn-secondary" onClick={() => void importToBoard("xml")} disabled={busy || !boardId}>Importar no board</button>
                  <button type="button" className="btn-secondary" onClick={() => void exportBoard("xml")} disabled={busy || !boardId}>Exportar do board</button>
                </div>
              </div>
            )}
          </div>
        ) : null}
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

