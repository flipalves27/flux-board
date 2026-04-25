"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type WheelEvent, type PointerEvent } from "react";
import { Barlow, Barlow_Condensed } from "next/font/google";
import { apiGet, apiPost } from "@/lib/api-client";
import { BoardTemplateExportModal } from "@/components/board/board-template-export-modal";
import { BpmnLegend } from "@/components/templates/bpmn-legend";
import {
  DeliveredEventGlyph,
  DeliveredGatewayGlyph,
  DeliveredStencilEventIcon,
  DeliveredStencilGatewayIcon,
} from "@/components/templates/bpmn-delivered-shapes";
import { bpmnModelToMarkdown, bpmnModelToXml } from "@/lib/bpmn-io";
import type { BpmnEdgeKind, BpmnNodeType, BpmnPort, BpmnSemanticVariant, BpmnTemplateModel } from "@/lib/bpmn-types";
import {
  BPMN_FLOW_EDGE_STYLES,
  BPMN_TASK_VARIANT_STYLES,
  isTaskLikeType,
  resolveBpmnTaskVariant,
} from "@/lib/bpmn-flow-tokens";
import { BPMN_VISUAL_STATE_TOKENS, BPMN_VISUAL_TOKENS, getBpmnVisualSpec } from "@/lib/bpmn-visual-system";
import { renderBpmnIcon } from "@/lib/bpmn-icon-render";

const barlow = Barlow({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"] });
const barlowCondensed = Barlow_Condensed({ subsets: ["latin"], weight: ["700", "800"] });

type Props = {
  getHeaders: () => Record<string, string>;
  isAdmin: boolean;
};

type BpmnModel = BpmnTemplateModel;
type CodeTab = "markdown" | "xml";
type BpmnStencil = {
  type: string;
  label: string;
  hint: string;
  category: "events" | "tasks" | "gateways" | "dados" | "swim";
  width: number;
  height: number;
  semanticVariant?: BpmnSemanticVariant;
  accentColor?: string;
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

/**
 * Core palette — componentes essenciais para diagramação BPMN.
 * Subtipos BPMN padrão (user_task, service_task, etc.) podem ser adicionados
 * livremente como nós genéricos pelo usuário.
 */
const BPMN_STENCILS: BpmnStencil[] = [
  // Events (core 3)
  { type: "start_event",   label: "Início",          hint: "Início do processo",        category: "events",  width: 44, height: 44 },
  { type: "message_event", label: "Mensagem",         hint: "Recebe / envia mensagem",   category: "events",  width: 44, height: 44 },
  { type: "end_event",     label: "Fim",              hint: "Fim do processo",           category: "events",  width: 44, height: 44 },
  // Tasks – 5 variantes visuais
  { type: "task", label: "Tarefa — Padrão", hint: "Tarefa manual / padrão", category: "tasks", width: 160, height: 60, semanticVariant: "default", accentColor: "var(--flux-bpmn-teal-accent)" },
  { type: "task", label: "Tarefa — Implementada", hint: "Já implementado / entregue", category: "tasks", width: 160, height: 60, semanticVariant: "delivered", accentColor: "var(--flux-bpmn-green-400)" },
  { type: "task", label: "Tarefa — Automação", hint: "Integração via API / sistêmica", category: "tasks", width: 160, height: 60, semanticVariant: "automation", accentColor: "var(--flux-bpmn-cyan-accent)" },
  { type: "task", label: "Tarefa — Pain Point", hint: "Retrabalho / ponto de dor identificado", category: "tasks", width: 160, height: 60, semanticVariant: "pain", accentColor: "var(--flux-bpmn-pain-red)" },
  { type: "task", label: "Tarefa — Sistema", hint: "Ação de sistema / serviço externo", category: "tasks", width: 160, height: 60, semanticVariant: "system", accentColor: "var(--flux-bpmn-flow-system)" },
  // Gateways
  { type: "exclusive_gateway", label: "XOR — Exclusivo", hint: "Decisão única (Sim/Não)",   category: "gateways", width: 56, height: 56 },
  { type: "parallel_gateway",  label: "AND — Paralelo",  hint: "Execução paralela",         category: "gateways", width: 56, height: 56 },
  { type: "inclusive_gateway", label: "OR — Inclusivo",  hint: "Uma ou mais saídas",        category: "gateways", width: 56, height: 56 },
  // Dados & Acessórios
  { type: "system_box",  label: "System Box",  hint: "Sistema / serviço externo integrado",          category: "dados", width: 150, height: 60 },
  { type: "annotation",  label: "Anotação",    hint: "Nota / observação no diagrama",               category: "dados", width: 160, height: 56 },
  { type: "data_object", label: "Documento",   hint: "Artefato / documento de dados",               category: "dados", width: 96,  height: 60 },
];

const SAMPLE_MD = `# BPMN Template
name: Novo diagrama BPMN
version: bpmn-2.0-lite

## Lanes
- solicitante: Solicitante
- processamento: Processamento

## Nodes
- start_1 | start_event | Início | (130,60) | lane:solicitante
- task_1 | task | Analisar solicitação | (280,60) | lane:solicitante
- gw_1 | exclusive_gateway | Aprovado? | (520,60) | lane:processamento
- task_2 | task | Processar | (660,60) | lane:processamento
- end_1 | end_event | Fim | (820,60) | lane:processamento

## Edges
- flow_1 | start_1 -> task_1 |
- flow_2 | task_1 -> gw_1 |
- flow_3 | gw_1 -> task_2 | Sim
- flow_4 | task_2 -> end_1 |
`;

const GRID_SIZE = 20;
const MIN_ZOOM = 0.12;
const MAX_ZOOM = 2.5;
const HISTORY_LIMIT = 80;
const ZOOM_STEP = 0.15;
/** Minimum x so nodes don't hide under the lane label bar (52px) + a bit of padding. */
const NODE_MIN_X = 60;
/** Minimum y so nodes don't go above all swim lanes. */
const NODE_MIN_Y = 8;

export function BpmnWorkspace({ getHeaders, isAdmin }: Props) {
  const [boardId, setBoardId] = useState("");
  const [openPublish, setOpenPublish] = useState(false);
  const [markdown, setMarkdown] = useState(SAMPLE_MD);
  const [xml, setXml] = useState("");
  const [model, setModel] = useState<BpmnModel>({
    version: "bpmn-2.0-lite",
    name: "Novo diagrama BPMN",
    lanes: [
      { id: "solicitante", label: "Solicitante", y: 12, height: 160, gradient: ["var(--flux-bpmn-teal-900)", "var(--flux-bpmn-teal-accent)"] },
      { id: "processamento", label: "Processamento", y: 192, height: 160, gradient: ["var(--flux-bpmn-blue-800)", "var(--flux-bpmn-blue-400)"] },
    ],
    nodes: [
      { id: "start_1", type: "start_event",       label: "Início",               x: 130, y: 60,  laneId: "solicitante",   width: 44,  height: 44 },
      { id: "task_1",  type: "task",              label: "Analisar solicitação", x: 260, y: 50,  laneId: "solicitante",   width: 160, height: 60, stepNumber: "1", subtitle: "Responsável" },
      { id: "gw_1",    type: "exclusive_gateway", label: "Aprovado?",            x: 510, y: 230, laneId: "processamento", width: 56,  height: 56 },
      { id: "task_2",  type: "task",              label: "Processar",            x: 660, y: 220, laneId: "processamento", width: 140, height: 60, stepNumber: "2", semanticVariant: "delivered" },
      { id: "task_3",  type: "task",              label: "Notificar resultado",  x: 660, y: 300, laneId: "processamento", width: 150, height: 60, stepNumber: "3" },
      { id: "end_1",   type: "end_event",         label: "Fim",                  x: 900, y: 250, laneId: "processamento", width: 44,  height: 44 },
    ],
    edges: [
      { id: "flow_1", sourceId: "start_1", targetId: "task_1",  kind: "primary" },
      { id: "flow_2", sourceId: "task_1",  targetId: "gw_1",    kind: "primary" },
      { id: "flow_3", sourceId: "gw_1",    targetId: "task_2",  kind: "primary",  label: "Sim" },
      { id: "flow_4", sourceId: "gw_1",    targetId: "task_3",  kind: "rework",   label: "Não" },
      { id: "flow_5", sourceId: "task_2",  targetId: "end_1",   kind: "primary" },
      { id: "flow_6", sourceId: "task_3",  targetId: "end_1" },
    ],
  });
  const [issues, setIssues] = useState<Array<{ severity: "error" | "warning"; message: string }>>([]);
  const [busy, setBusy] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string>("");
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [edgeFrom, setEdgeFrom] = useState<string>("");
  const [edgeTo, setEdgeTo] = useState<string>("");
  const [zoom, setZoom] = useState(1.0);
  const [pan, setPan] = useState({ x: 40, y: 20 });
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
  const [showEdges, setShowEdges] = useState(true);
  /** Legenda na coluna direita: oculta por padrão. */
  const [legendExpanded, setLegendExpanded] = useState(false);
  const [presentMode, setPresentMode] = useState(false);
  const [editingSubtitle, setEditingSubtitle] = useState("");
  const [editingTooltip, setEditingTooltip] = useState("");
  const [editingStep, setEditingStep] = useState("");
  const [editingPain, setEditingPain] = useState("");
  const [editingLaneTag, setEditingLaneTag] = useState("");
  const [paletteCollapsed, setPaletteCollapsed] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [savingBoard, setSavingBoard] = useState(false);
  /** Context menu: right-click on a node shows quick actions. */
  const [contextMenu, setContextMenu] = useState<{ nodeId: string; x: number; y: number } | null>(null);
  /** Lane drag — tracks which lane is being moved vertically. */
  const [laneDrag, setLaneDrag] = useState<{ laneId: string; startClientY: number; originY: number } | null>(null);
  const laneDragRef = useRef<typeof laneDrag>(null);
  /** Lane hovered — shows controls (delete/rename). */
  const [hoveredLaneId, setHoveredLaneId] = useState<string>("");
  /** Lane inline label editing. */
  const [editingLaneId, setEditingLaneId] = useState<string | null>(null);
  const [editingLaneLabelInput, setEditingLaneLabelInput] = useState("");
  /** Palette groups collapsed state — all collapsed by default. */
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set(["events", "tasks", "gateways", "dados"]));
  /** Durante arrasto: delta em canvas; commit no pointerup. */
  const [liveDragDelta, setLiveDragDelta] = useState<{ dx: number; dy: number } | null>(null);
  const dragRafRef = useRef<number | null>(null);
  const pendingDragDeltaRef = useRef<{ dx: number; dy: number } | null>(null);
  /** Duplo clique: edição rápida de título e descrição (subtitle). */
  const [inlineEditNodeId, setInlineEditNodeId] = useState<string | null>(null);
  const [inlineTitle, setInlineTitle] = useState("");
  const [inlineDesc, setInlineDesc] = useState("");
  const inlineEditRef = useRef<HTMLDivElement | null>(null);
  const nodeDragRef = useRef(nodeDrag);
  nodeDragRef.current = nodeDrag;
  const liveDragDeltaRef = useRef(liveDragDelta);
  liveDragDeltaRef.current = liveDragDelta;
  laneDragRef.current = laneDrag;
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

  function colorWithAlpha(base: string, alpha: number): string {
    const pct = Math.round(alpha * 100);
    return `color-mix(in srgb, ${base} ${pct}%, transparent)`;
  }

  const bpmnGridLineFine = "color-mix(in srgb, var(--flux-primary) 12%, transparent)";
  const bpmnGridLineBold = "color-mix(in srgb, var(--flux-primary) 22%, transparent)";

  function paletteForType(type: string): string {
    const spec = getBpmnVisualSpec(type);
    const key = spec.colorToken as keyof typeof BPMN_VISUAL_TOKENS.semanticPalette;
    return BPMN_VISUAL_TOKENS.semanticPalette[key] ?? BPMN_VISUAL_TOKENS.semanticPalette.task;
  }

  function shapeClass(type: string): string {
    const { shape } = getBpmnVisualSpec(type);
    if (shape === "diamond") return "rotate-45 rounded-[4px]";
    if (shape === "circle") return "rounded-full";
    if (shape === "document") return "rounded-[2px]";
    return "rounded-[var(--flux-rad)]";
  }

  function isRotatedShape(type: string): boolean {
    return getBpmnVisualSpec(type).shape === "diamond";
  }

  function nodeStyle(type: string, state: "default" | "selected" = "default"): CSSProperties {
    const spec = getBpmnVisualSpec(type);
    const stateToken = state === "selected" ? BPMN_VISUAL_STATE_TOKENS.selected : BPMN_VISUAL_STATE_TOKENS.default;
    const baseColor = state === "selected" ? BPMN_VISUAL_TOKENS.semanticPalette.selected : paletteForType(type);
    const borderWidth =
      spec.borderStyle === "thick" ? BPMN_VISUAL_TOKENS.strokeEmphasis : BPMN_VISUAL_TOKENS.stroke * stateToken.strokeScale;
    return {
      borderColor: colorWithAlpha(baseColor, 0.78),
      backgroundColor: colorWithAlpha(baseColor, 0.18),
      borderWidth,
      borderStyle: spec.borderStyle === "double" ? "double" : "solid",
      opacity: stateToken.opacity,
    };
  }

  function cloneModel(source: BpmnModel): BpmnModel {
    return JSON.parse(JSON.stringify(source)) as BpmnModel;
  }

  function snap(v: number): number {
    return Math.round(v / GRID_SIZE) * GRID_SIZE;
  }

  function laneForY(y: number, lanes: BpmnModel["lanes"]): string | undefined {
    const sorted = [...lanes].sort((a, b) => (a.y ?? 0) - (b.y ?? 0));
    const lane = sorted.find((l) => {
      const top = l.y ?? 0;
      const h = l.height ?? 128;
      return y >= top && y <= top + h;
    });
    return lane?.id;
  }

  function inferEdgeKind(sourceId: string, targetId: string, nodes: BpmnModel["nodes"]): BpmnEdgeKind | undefined {
    const a = nodes.find((n) => n.id === sourceId);
    const b = nodes.find((n) => n.id === targetId);
    if (!a || !b) return undefined;
    if (a.laneId && b.laneId && a.laneId !== b.laneId) return "cross_lane";
    return undefined;
  }

  function resetView() {
    setZoom(1.0);
    setPan({ x: 40, y: 20 });
  }

  function fitView() {
    const el = canvasRef.current;
    if (!el || model.nodes.length === 0) return;
    const minX = Math.min(...model.nodes.map((n) => n.x));
    const minY = Math.min(...model.nodes.map((n) => n.y));
    const maxX = Math.max(...model.nodes.map((n) => n.x + (n.width ?? 110)));
    const maxY = Math.max(...model.nodes.map((n) => n.y + (n.height ?? 54)));
    const cw = el.clientWidth;
    const ch = el.clientHeight;
    const bw = Math.max(1, maxX - minX + 120);
    const bh = Math.max(1, maxY - minY + 100);
    const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.min(cw / bw, ch / bh) * 0.92));
    const z = Number(nextZoom.toFixed(2));
    setZoom(z);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    setPan({
      x: Math.round(cw * 0.5 - cx * z),
      y: Math.round(ch * 0.5 - cy * z),
    });
  }

  function stencilMeta(type: string): BpmnStencil | undefined {
    return BPMN_STENCILS.find((s) => s.type === type);
  }

  function displayType(type: string): string {
    const label = stencilMeta(type)?.label ?? type.replace(/_/g, " ");
    // Strip " — Variant" suffix used only in the palette
    return label.replace(/\s—\s.+$/, "");
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

  const syncCodeFromModel = useCallback((next: BpmnModel) => {
    setMarkdown(bpmnModelToMarkdown(next));
    setXml(bpmnModelToXml(next));
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

  function addNode(type: string, x: number, y: number, semanticVariant?: BpmnSemanticVariant) {
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
            type: type as BpmnNodeType,
            label: type.replace(/_/g, " "),
            x,
            y,
            laneId,
            width: meta?.width ?? (type.includes("event") ? 88 : 120),
            height: meta?.height ?? (type.includes("event") ? 48 : 56),
            ...(semanticVariant ? { semanticVariant } : {}),
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
    const variant = e.dataTransfer.getData("application/x-bpmn-variant") as BpmnSemanticVariant | "";
    const nodeId = e.dataTransfer.getData("application/x-bpmn-node");
    const coords = toCanvasCoords(e.clientX, e.clientY);
    setIsCanvasDropActive(false);
    setDragPreview(null);
    setDraggingType("");
    if (!coords) return;
    const x = Math.max(NODE_MIN_X, snap(coords.x));
    const y = Math.max(NODE_MIN_Y, snap(coords.y));
    if (type) {
      addNode(type, x, y, variant || undefined);
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
    // Zoom toward mouse cursor (focal-point zoom, same as reference HTML)
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) {
      setZoom((prev) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Number((prev * factor).toFixed(2)))));
      return;
    }
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    setZoom((prev) => {
      const ns = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, prev * factor));
      setPan((p) => ({
        x: mx - (mx - p.x) * (ns / prev),
        y: my - (my - p.y) * (ns / prev),
      }));
      return ns;
    });
  }

  function onCanvasPointerDown(e: PointerEvent<HTMLDivElement>) {
    // Dismiss context menu on any canvas click
    if (contextMenu) { setContextMenu(null); }
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
    // Lane vertical drag
    const ld = laneDragRef.current;
    if (ld) {
      const deltaClient = e.clientY - ld.startClientY;
      const deltaCanvas = deltaClient / zoom;
      const newY = Math.max(0, snap(ld.originY + deltaCanvas));
      setModel((prev) => ({
        ...prev,
        lanes: prev.lanes.map((l) => l.id === ld.laneId ? { ...l, y: newY } : l),
      }));
      return;
    }
    if (!isPanning || !panStartRef.current) return;
    const dx = e.clientX - panStartRef.current.x;
    const dy = e.clientY - panStartRef.current.y;
    setPan({ x: panStartRef.current.originX + dx, y: panStartRef.current.originY + dy });
  }

  function onCanvasPointerUp() {
    const nd = nodeDragRef.current;
    const ld = liveDragDeltaRef.current;
    if (nd && ld) {
      setModel((prev) => {
        const next: BpmnModel = {
          ...prev,
          nodes: prev.nodes.map((n) => {
            if (!nd.ids.includes(n.id)) return n;
            const origin = nd.origins[n.id];
            const x = Math.max(NODE_MIN_X, snap(origin.x + ld.dx));
            const y = Math.max(NODE_MIN_Y, snap(origin.y + ld.dy));
            return { ...n, x, y, laneId: laneForY(y, prev.lanes) };
          }),
        };
        syncCodeFromModel(next);
        return next;
      });
    }
    if (dragRafRef.current != null) {
      cancelAnimationFrame(dragRafRef.current);
      dragRafRef.current = null;
    }
    pendingDragDeltaRef.current = null;
    setIsPanning(false);
    panStartRef.current = null;
    setNodeDrag(null);
    setLiveDragDelta(null);
    setAlignGuides([]);
    setBoxSelect(null);
    // Commit lane drag — sync nodes to updated lane positions
    if (laneDragRef.current) {
      setModel((prev) => {
        const next: BpmnModel = {
          ...prev,
          nodes: prev.nodes.map((n) => ({ ...n, laneId: laneForY(n.y, prev.lanes) })),
        };
        syncCodeFromModel(next);
        return next;
      });
      setLaneDrag(null);
    }
  }

  function addEdge() {
    if (!edgeFrom || !edgeTo || edgeFrom === edgeTo) return;
    setModel((prev) => {
      if (prev.edges.some((e) => e.sourceId === edgeFrom && e.targetId === edgeTo)) return prev;
      const kind = inferEdgeKind(edgeFrom, edgeTo, prev.nodes);
      const next: BpmnModel = {
        ...prev,
        edges: [
          ...prev.edges,
          {
            id: `flow_${Math.random().toString(36).slice(2, 7)}`,
            sourceId: edgeFrom,
            targetId: edgeTo,
            waypoints: [],
            ...(kind ? { kind } : {}),
          },
        ],
      };
      syncCodeFromModel(next);
      return next;
    });
  }

  function addEdgeDirect(sourceId: string, targetId: string) {
    if (!sourceId || !targetId || sourceId === targetId) return;
    setModel((prev) => {
      if (prev.edges.some((e) => e.sourceId === sourceId && e.targetId === targetId)) return prev;
      const kind = inferEdgeKind(sourceId, targetId, prev.nodes);
      const next: BpmnModel = {
        ...prev,
        edges: [
          ...prev.edges,
          {
            id: `flow_${Math.random().toString(36).slice(2, 7)}`,
            sourceId,
            targetId,
            waypoints: [],
            ...(kind ? { kind } : {}),
          },
        ],
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
    byId: Map<string, BpmnModel["nodes"][number]>,
    obstacleNodes: BpmnModel["nodes"],
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
      const sameRow = Math.abs(start.y - end.y) < 3;
      const sameCol = Math.abs(start.x - end.x) < 3;
      if (sameRow && start.x <= end.x && startPort === "east" && targetPort === "west") {
        const straight = applyAutoRouting([start, end], edge, obstacleNodes);
        if (straight.length === 2) return straight;
      }
      if (sameCol && start.y <= end.y && startPort === "south" && targetPort === "north") {
        const straight = applyAutoRouting([start, end], edge, obstacleNodes);
        if (straight.length === 2) return straight;
      }
      const midX = snap(start.x + (end.x - start.x) / 2);
      return applyAutoRouting([start, { x: midX, y: start.y }, { x: midX, y: end.y }, end], edge, obstacleNodes);
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
    return applyAutoRouting(points, edge, obstacleNodes);
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

  const nodesForEdges = useMemo(() => {
    if (!nodeDrag) return model.nodes;
    const ld = liveDragDelta ?? { dx: 0, dy: 0 };
    return model.nodes.map((n) => {
      if (!nodeDrag.ids.includes(n.id)) return n;
      const o = nodeDrag.origins[n.id];
      const x = Math.max(NODE_MIN_X, snap(o.x + ld.dx));
      const y = Math.max(NODE_MIN_Y, snap(o.y + ld.dy));
      return { ...n, x, y, laneId: laneForY(y, model.lanes) };
    });
  }, [model.nodes, model.lanes, nodeDrag, liveDragDelta]);

  const edgesWithPoints = useMemo(
    () => {
      const byId = new Map(nodesForEdges.map((n) => [n.id, n]));
      return model.edges
        .map((e) => {
          const points = buildEdgePoints(e, byId, nodesForEdges);
          if (!points.length) return null;
          const wps = Array.isArray(e.waypoints) ? e.waypoints : [];
          return { ...e, points, waypoints: wps };
        })
        .filter(Boolean) as Array<{
        id: string;
        points: Array<{ x: number; y: number }>;
        label?: string;
        waypoints: Array<{ x: number; y: number }>;
      }>;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `buildEdgePoints` is stable; recompute from edges + layout nodes only
    [model.edges, nodesForEdges],
  );

  const connectPreviewLine = useMemo(() => {
    if (!connectingFromId || !connectPreview) return null;
    const from = nodesForEdges.find((n) => n.id === connectingFromId);
    if (!from) return null;
    const x1 = from.x + (from.width ?? 110);
    const y1 = from.y + (from.height ?? 54) / 2;
    return { x1, y1, x2: connectPreview.x, y2: connectPreview.y };
  }, [connectingFromId, connectPreview, nodesForEdges]);

  const selectedNode = useMemo(() => model.nodes.find((n) => n.id === selectedNodeId) ?? null, [model.nodes, selectedNodeId]);
  const selectedEdge = useMemo(() => model.edges.find((e) => e.id === selectedEdgeId) ?? null, [model.edges, selectedEdgeId]);

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

  function updateSelectedEdge(patch: Partial<BpmnModel["edges"][number]>) {
    if (!selectedEdgeId) return;
    setModel((prev) => {
      const next: BpmnModel = {
        ...prev,
        edges: prev.edges.map((e) => (e.id === selectedEdgeId ? { ...e, ...patch } : e)),
      };
      syncCodeFromModel(next);
      return next;
    });
  }

  function commitInlineEdit() {
    if (!inlineEditNodeId) return;
    const id = inlineEditNodeId;
    const title = inlineTitle.trim();
    const desc = inlineDesc.trim();
    setModel((prev) => {
      const next: BpmnModel = {
        ...prev,
        nodes: prev.nodes.map((n) =>
          n.id === id ? { ...n, label: title || n.label, subtitle: desc || undefined } : n,
        ),
      };
      syncCodeFromModel(next);
      return next;
    });
    setInlineEditNodeId(null);
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

  function updateLaneTag() {
    if (!selectedNode?.laneId) return;
    setModel((prev) => {
      const next: BpmnModel = {
        ...prev,
        lanes: prev.lanes.map((l) => (l.id === selectedNode.laneId ? { ...l, tag: editingLaneTag.trim() || undefined } : l)),
      };
      syncCodeFromModel(next);
      return next;
    });
  }

  useEffect(() => {
    const n = model.nodes.find((x) => x.id === selectedNodeId);
    if (!n) {
      setEditingSubtitle("");
      setEditingTooltip("");
      setEditingStep("");
      setEditingPain("");
      setEditingLaneTag("");
      return;
    }
    setEditingLabel(n.label);
    setEditingSubtitle(n.subtitle ?? "");
    setEditingTooltip(n.tooltip ?? "");
    setEditingStep(n.stepNumber ?? "");
    setEditingPain(n.painBadge ?? "");
    const lane = model.lanes.find((l) => l.id === n.laneId);
    setEditingLaneTag(lane?.tag ?? "");
  }, [selectedNodeId, model]);

  useEffect(() => {
    if (!inlineEditNodeId) return;
    const t = window.setTimeout(() => {
      const el = inlineEditRef.current?.querySelector("input");
      (el as HTMLInputElement | undefined)?.focus();
    }, 0);
    return () => clearTimeout(t);
  }, [inlineEditNodeId]);

  useEffect(() => {
    const onKeyDown = (ev: KeyboardEvent) => {
      const target = ev.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;

      if (ev.key === "Escape") {
        if (inlineEditNodeId) {
          ev.preventDefault();
          setInlineEditNodeId(null);
          return;
        }
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
            const x = Math.max(NODE_MIN_X, snap(n.x + step));
            const y = Math.max(NODE_MIN_Y, snap(n.y + step));
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
              const x = Math.max(NODE_MIN_X, snap(n.x + dx));
              const y = Math.max(NODE_MIN_Y, snap(n.y + dy));
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
      // Font size shortcuts: [ to decrease, ] to increase for selected node
      if (!ev.ctrlKey && !ev.metaKey && !ev.altKey && (ev.key === "[" || ev.key === "]")) {
        const nodeId = selectedNodeId || (selectedNodeIds.length === 1 ? selectedNodeIds[0] : "");
        if (!nodeId) return;
        ev.preventDefault();
        setModel((prev) => {
          const next: BpmnModel = {
            ...prev,
            nodes: prev.nodes.map((n) => {
              if (n.id !== nodeId) return n;
              const current = n.fontSize ?? 13;
              const next = ev.key === "[" ? Math.max(8, current - 1) : Math.min(32, current + 1);
              return { ...n, fontSize: next };
            }),
          };
          syncCodeFromModel(next);
          return next;
        });
        return;
      }
      // Zoom with +/- keys (no modifier needed)
      if (!ev.ctrlKey && !ev.metaKey && !ev.altKey && (ev.key === "+" || ev.key === "=")) {
        ev.preventDefault();
        setZoom((z) => Math.min(MAX_ZOOM, z + ZOOM_STEP));
        return;
      }
      if (!ev.ctrlKey && !ev.metaKey && !ev.altKey && ev.key === "-") {
        ev.preventDefault();
        setZoom((z) => Math.max(MIN_ZOOM, z - ZOOM_STEP));
        return;
      }
      // Reset view with R key
      if (!ev.ctrlKey && !ev.metaKey && !ev.altKey && !ev.shiftKey && ev.key.toLowerCase() === "r") {
        ev.preventDefault();
        setZoom(1.0);
        setPan({ x: 40, y: 20 });
        return;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [connectingFromId, connectPreview, selectedNodeId, selectedNodeIds, selectedWaypoint, selectedEdgeId, syncCodeFromModel, inlineEditNodeId]);

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
    const minX = Math.min(...nodesForEdges.map((n) => n.x), 0);
    const minY = Math.min(...nodesForEdges.map((n) => n.y), 0);
    const maxX = Math.max(...nodesForEdges.map((n) => n.x + (n.width ?? 110)), 1200);
    const maxY = Math.max(...nodesForEdges.map((n) => n.y + (n.height ?? 54)), 700);
    return { minX: minX - 80, minY: minY - 60, width: maxX - minX + 160, height: maxY - minY + 120 };
  }, [nodesForEdges]);

  return (
    <div className={`${barlow.className} bpmn-workspace flex min-h-0 flex-1 flex-col gap-3 overflow-hidden`}>
      <header
        className={`flex flex-wrap items-center gap-2 rounded-xl px-3 shadow-[var(--flux-bpmn-workspace-chrome-shadow)] sm:gap-3 sm:px-4 ${presentMode ? "min-h-[48px] py-2" : "min-h-[52px] py-2.5"}`}
        style={{ background: "var(--bpmn-toolbar-bg)" }}
      >
        <span className={`${barlowCondensed.className} text-[22px] font-extrabold uppercase tracking-[2px] text-white`}>
          FLUX <span style={{ color: "var(--flux-primary-light)" }}>BPMN</span>
        </span>
        <div className="hidden h-7 w-px bg-white/20 sm:block" />
        <span className="max-w-[min(280px,38vw)] truncate text-[13px] font-semibold text-white/90 sm:max-w-[min(380px,45vw)] sm:text-[14px]">{model.name}</span>
        <div className="flex flex-wrap items-center gap-2 border-l border-white/15 pl-2 sm:pl-3">
          <label htmlFor="bpmn-board-id" className="sr-only">
            Board ID
          </label>
          <input
            id="bpmn-board-id"
            value={boardId}
            onChange={(e) => setBoardId(e.target.value)}
            className="w-[min(140px,28vw)] rounded-lg border border-white/15 bg-white/8 px-2 py-1.5 text-[12px] text-white placeholder:text-white/35 focus:border-[var(--flux-primary)]/70 focus:outline-none sm:w-40"
            placeholder="Board ID"
          />
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            className="rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-[13px] font-semibold text-white transition hover:bg-white/20"
            onClick={() => setZoom((z) => Math.min(MAX_ZOOM, Math.round((z + ZOOM_STEP) * 100) / 100))}
          >
            +
          </button>
          <span className="min-w-[44px] text-center text-[13px] font-semibold text-white/80">{(zoom * 100).toFixed(0)}%</span>
          <button
            type="button"
            className="rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-[13px] font-semibold text-white transition hover:bg-white/20"
            onClick={() => setZoom((z) => Math.max(MIN_ZOOM, Math.round((z - ZOOM_STEP) * 100) / 100))}
          >
            −
          </button>
          <div className="mx-1 hidden h-7 w-px bg-white/20 sm:block" />
          <button
            type="button"
            className="rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-[13px] font-semibold text-white transition hover:bg-white/20"
            onClick={resetView}
          >
            Reset
          </button>
          <button
            type="button"
            className="rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-[13px] font-semibold text-white transition hover:bg-white/20"
            onClick={fitView}
          >
            Encaixar
          </button>
          <div className="mx-1 hidden h-7 w-px bg-white/20 sm:block" />
          <button
            type="button"
            aria-pressed={showEdges}
            className={`rounded-lg border px-3 py-1.5 text-[13px] font-semibold transition ${
              showEdges ? "border-[var(--flux-primary)] bg-[var(--flux-primary)] text-white shadow-[0_0_12px_var(--flux-primary-alpha-40)]" : "border-white/20 bg-white/10 text-white hover:bg-white/20"
            }`}
            onClick={() => setShowEdges((v) => !v)}
          >
            Conexões
          </button>
          <button
            type="button"
            className={`rounded-lg border px-3 py-1.5 text-[13px] font-semibold transition ${
              legendExpanded ? "border-[var(--flux-primary)] bg-[var(--flux-primary)] text-white shadow-[0_0_12px_var(--flux-primary-alpha-40)]" : "border-white/20 bg-white/10 text-white hover:bg-white/20"
            }`}
            aria-pressed={legendExpanded}
            onClick={() => setLegendExpanded((v) => !v)}
          >
            Legenda
          </button>
          <button
            type="button"
            className={`rounded-lg border px-3 py-1.5 text-[13px] font-semibold transition ${
              presentMode ? "border-[var(--flux-primary)] bg-[var(--flux-primary)] text-white shadow-[0_0_12px_var(--flux-primary-alpha-40)]" : "border-white/20 bg-white/10 text-white hover:bg-white/20"
            }`}
            onClick={() => setPresentMode((v) => !v)}
          >
            Apresentação
          </button>
          <div className="mx-1 hidden h-7 w-px bg-white/20 sm:block" />
          <button
            type="button"
            title="Desfazer (Ctrl+Z)"
            className="rounded-lg border border-white/20 bg-white/10 px-2.5 py-1.5 text-[13px] font-semibold text-white transition hover:bg-white/20"
            onClick={() => {
              const nextIndex = historyIndexRef.current - 1;
              const stack = historyRef.current;
              if (nextIndex < 0 || nextIndex >= stack.length) return;
              historyIndexRef.current = nextIndex;
              const nextModel = JSON.parse(JSON.stringify(stack[nextIndex])) as BpmnModel;
              suppressHistoryRef.current = true;
              setModel(nextModel);
            }}
          >
            ↩
          </button>
          <button
            type="button"
            title="Refazer (Ctrl+Y)"
            className="rounded-lg border border-white/20 bg-white/10 px-2.5 py-1.5 text-[13px] font-semibold text-white transition hover:bg-white/20"
            onClick={() => {
              const nextIndex = historyIndexRef.current + 1;
              const stack = historyRef.current;
              if (nextIndex >= stack.length) return;
              historyIndexRef.current = nextIndex;
              const nextModel = JSON.parse(JSON.stringify(stack[nextIndex])) as BpmnModel;
              suppressHistoryRef.current = true;
              setModel(nextModel);
            }}
          >
            ↪
          </button>
          <div className="mx-1 hidden h-7 w-px bg-white/20 sm:block" />
          <button
            type="button"
            disabled={savingBoard || !boardId.trim()}
            className="rounded-lg border border-[var(--flux-primary)] bg-[var(--flux-primary)] px-3 py-1.5 text-[13px] font-semibold text-white shadow-[0_0_12px_var(--flux-primary-alpha-35)] transition hover:bg-[var(--flux-primary-light)] disabled:opacity-50"
            onClick={async () => {
              if (!boardId.trim()) return;
              setSavingBoard(true);
              try {
                await apiPost(`/api/boards/${boardId.trim()}/bpmn-export`, { model, format: "markdown" }, getHeaders());
              } catch {
                // silently ignore – user can see state via issues list
              } finally {
                setSavingBoard(false);
              }
            }}
          >
            {savingBoard ? "Salvando…" : "Salvar"}
          </button>
          <div className="relative">
            <button
              type="button"
              className="rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-[13px] font-semibold text-white transition hover:bg-white/20"
              onClick={() => setShowExportMenu((v) => !v)}
            >
              Exportar ▾
            </button>
            {showExportMenu && (
              <div
                className="absolute right-0 top-full z-50 mt-1 min-w-[130px] rounded-lg border border-[var(--flux-border-default)] bg-[var(--flux-surface-card)] py-1 shadow-[var(--flux-shadow-xl)]"
                onPointerLeave={() => setShowExportMenu(false)}
              >
                {(["PNG", "SVG", "PDF"] as const).map((fmt) => (
                  <button
                    key={fmt}
                    type="button"
                    className="w-full px-3 py-1.5 text-left text-[13px] font-semibold text-[var(--flux-text)] hover:bg-[var(--flux-surface-elevated)]"
                    onClick={() => {
                      setShowExportMenu(false);
                      // Export stubs — wired to board export API
                      void apiPost(`/api/boards/${boardId.trim() || "local"}/bpmn-export`, { model, format: fmt.toLowerCase() }, getHeaders()).catch(() => null);
                    }}
                  >
                    {fmt}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </header>
      <div className={`grid min-h-0 flex-1 gap-3 xl:items-stretch xl:gap-4 ${
        paletteCollapsed && !isPropertiesVisible ? "grid-cols-1 xl:grid-cols-[48px_1fr_48px]"
        : paletteCollapsed ? "grid-cols-1 xl:grid-cols-[48px_1fr_260px]"
        : !isPropertiesVisible ? "grid-cols-1 xl:grid-cols-[240px_1fr_48px]"
        : "grid-cols-1 xl:grid-cols-[240px_1fr_260px]"
      }`}>
        <aside className={`flex min-h-0 flex-col gap-3 overflow-y-auto rounded-xl border border-[var(--flux-border-default)] bg-[var(--flux-surface-card)] shadow-[var(--flux-shadow-md)] ${paletteCollapsed ? "p-2" : "p-3"}`}>
          {/* Palette header */}
          <div className="flex items-center justify-between gap-2">
            {!paletteCollapsed && (
              <p className="text-[11px] font-extrabold uppercase tracking-wide text-[var(--flux-text)]">Componentes</p>
            )}
            <button
              type="button"
              title={paletteCollapsed ? "Expandir palette" : "Recolher palette"}
              className="ml-auto rounded-md border border-[var(--flux-border-default)] bg-[var(--flux-surface-elevated)] px-1.5 py-0.5 text-[11px] font-bold text-[var(--flux-text-muted)] transition hover:border-[var(--flux-primary)]/60 hover:text-[var(--flux-primary-light)]"
              onClick={() => setPaletteCollapsed((v) => !v)}
            >
              {paletteCollapsed ? "▶" : "◀"}
            </button>
          </div>

          {paletteCollapsed ? (
            /* Icon-only collapsed view */
            <div className="flex flex-col items-center gap-2 pt-1">
              {BPMN_STENCILS.slice(0, 10).map((stencil, idx) => (
                <button
                  key={`col_${stencil.type}_${idx}`}
                  type="button"
                  draggable
                  title={stencil.label}
                  onDragStart={(e) => {
                    e.dataTransfer.setData("application/x-bpmn-type", stencil.type);
                    if (stencil.semanticVariant) e.dataTransfer.setData("application/x-bpmn-variant", stencil.semanticVariant);
                    setDraggingType(stencil.type);
                  }}
                  onDragEnd={() => { setDraggingType(""); setIsCanvasDropActive(false); setDragPreview(null); }}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200/90 bg-white shadow-sm hover:border-[var(--flux-bpmn-teal-accent)]/50 dark:border-slate-600 dark:bg-slate-900"
                >
                  {stencil.category === "events" ? (
                    <DeliveredStencilEventIcon type={stencil.type as BpmnNodeType} />
                  ) : stencil.category === "gateways" ? (
                    <DeliveredStencilGatewayIcon type={stencil.type as BpmnNodeType} />
                  ) : (
                    <span className="h-5 w-1 rounded-full" style={{ background: stencil.accentColor ?? "var(--flux-bpmn-teal-accent)" }} />
                  )}
                </button>
              ))}
            </div>
          ) : (
            <>
              <p className="text-[11px] leading-snug text-[var(--flux-text-muted)]">
                Arraste componentes para o canvas. Duplo clique no canvas para editar inline.
              </p>

              {/* Groups: Eventos, Atividades, Gateways, Dados — collapsible, all collapsed by default */}
              {(["events", "tasks", "gateways", "dados"] as const).map((group) => {
                const groupItems = BPMN_STENCILS.filter((s) => s.category === group);
                const groupLabel =
                  group === "events" ? "Eventos" :
                  group === "tasks"  ? "Atividades" :
                  group === "gateways" ? "Gateways" :
                  "Dados & Acessórios";
                const isGroupCollapsed = collapsedGroups.has(group);
                const toggleGroup = () =>
                  setCollapsedGroups((prev) => {
                    const next = new Set(prev);
                    if (next.has(group)) next.delete(group); else next.add(group);
                    return next;
                  });
                return (
                  <div key={group} className="rounded-lg border border-[var(--flux-border-default)] bg-[var(--flux-surface-elevated)] overflow-hidden">
                    {/* Group header — clickable to toggle */}
                    <button
                      type="button"
                      className="flex w-full items-center justify-between px-2.5 py-2 text-left transition hover:bg-[var(--flux-primary)]/10"
                      onClick={toggleGroup}
                    >
                      <span className="text-[10px] font-bold uppercase tracking-wide text-[var(--flux-text-muted)]">{groupLabel}</span>
                      <span className="text-[10px] text-[var(--flux-text-muted)] transition-transform duration-200" style={{ display: "inline-block", transform: isGroupCollapsed ? "rotate(0deg)" : "rotate(90deg)" }}>▶</span>
                    </button>
                    {/* Group items */}
                    {!isGroupCollapsed && (
                      <div className="grid grid-cols-1 gap-1 px-2 pb-2">
                        {groupItems.map((stencil, idx) => (
                          <button
                            key={`${stencil.type}_${stencil.semanticVariant ?? idx}`}
                            type="button"
                            draggable
                            onDragStart={(e) => {
                              e.dataTransfer.setData("application/x-bpmn-type", stencil.type);
                              if (stencil.semanticVariant) e.dataTransfer.setData("application/x-bpmn-variant", stencil.semanticVariant);
                              setDraggingType(stencil.type);
                            }}
                            onDragEnd={() => { setDraggingType(""); setIsCanvasDropActive(false); setDragPreview(null); }}
                            className="text-left transition hover:opacity-95"
                            title={stencil.hint}
                          >
                            <div className="flex items-center gap-2.5 rounded-[8px] border border-[var(--flux-border-subtle)] bg-[var(--flux-surface-card)] px-2.5 py-2 shadow-[var(--flux-shadow-sm)] transition hover:border-[var(--flux-primary)]/40 hover:shadow-[var(--flux-shadow-md)]">
                              <span className="pointer-events-none shrink-0">
                                {stencil.category === "events" ? (
                                  <DeliveredStencilEventIcon type={stencil.type as BpmnNodeType} />
                                ) : stencil.category === "gateways" ? (
                                  <DeliveredStencilGatewayIcon type={stencil.type as BpmnNodeType} />
                                ) : stencil.category === "dados" && stencil.type === "annotation" ? (
                                  <span
                                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[0_6px_6px_0] border-l-4 bg-[var(--flux-bpmn-annotation-bg)]"
                                    style={{ borderLeftColor: "var(--flux-bpmn-semantic-gateway)" }}
                                  >
                                    <span className="text-[14px]">✎</span>
                                  </span>
                                ) : stencil.category === "dados" && stencil.type === "system_box" ? (
                                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[6px] border-2 border-dashed bg-[var(--flux-surface-elevated)]" style={{ borderColor: "var(--flux-primary)" }}>
                                    <span className="text-[12px]">⚙</span>
                                  </span>
                                ) : stencil.category === "dados" ? (
                                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-[var(--flux-border-subtle)] bg-[var(--flux-surface-elevated)] text-[14px]">
                                    📄
                                  </span>
                                ) : (
                                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] border border-[var(--flux-border-subtle)] bg-[var(--flux-surface-elevated)] shadow-sm">
                                    <span
                                      className="h-6 w-1.5 rounded-full"
                                      style={{ background: stencil.accentColor ?? "var(--flux-bpmn-prop-border)" }}
                                      aria-hidden
                                    />
                                  </span>
                                )}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-[11px] font-bold leading-tight text-[var(--flux-text)]">{stencil.label}</span>
                                <span className="mt-0.5 block truncate text-[10px] font-medium leading-snug text-[var(--flux-text-muted)]">{stencil.hint}</span>
                              </span>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Swim Lanes section */}
              <div className="space-y-2 rounded-lg border border-[var(--flux-border-default)] bg-[var(--flux-surface-elevated)] p-2.5">
                <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--flux-text-muted)]">Swim Lanes</p>
                <button
                  type="button"
                  className="w-full rounded-[10px] border border-dashed border-[var(--flux-primary)]/50 bg-[var(--flux-surface-card)] px-2.5 py-2 text-left shadow-sm transition hover:border-[var(--flux-primary)] hover:shadow-[var(--flux-shadow-primary-soft)]"
                  onClick={() => {
                    setModel((prev) => {
                      const idx = prev.lanes.length;
                      const lastY = prev.lanes.reduce((maxY, l) => Math.max(maxY, (l.y ?? 0) + (l.height ?? 128)), 12);
                      const next: BpmnModel = {
                        ...prev,
                        lanes: [
                          ...prev.lanes,
                          { id: `lane_${Math.random().toString(36).slice(2, 7)}`, label: `Raia ${idx + 1}`, y: lastY + 8, height: 128 },
                        ],
                      };
                      syncCodeFromModel(next);
                      return next;
                    });
                  }}
                >
                  <span className="flex items-center gap-2 text-[11px] font-bold" style={{ color: "var(--flux-primary-light)" }}>
                    <span className="text-lg leading-none">+</span> Nova Swim Lane
                  </span>
                  <span className="mt-0.5 block text-[10px] text-[var(--flux-text-muted)]">Arrastar nós para dentro após criar</span>
                </button>
              </div>
              {/* Connect elements section (inside expanded palette) */}
              <div className="space-y-2 pt-1 border-t border-[var(--flux-border-muted)]">
                <p className="text-xs font-semibold text-[var(--flux-text-muted)]">Conectar elementos</p>
                <select value={edgeFrom} onChange={(e) => setEdgeFrom(e.target.value)} className="w-full rounded-lg border border-[var(--flux-control-border)] bg-[var(--flux-surface-elevated)] px-2 py-1.5 text-xs text-[var(--flux-text)]">
                  <option value="">Origem</option>
                  {model.nodes.map((n) => (
                    <option key={n.id} value={n.id}>{n.label}</option>
                  ))}
                </select>
                <select value={edgeTo} onChange={(e) => setEdgeTo(e.target.value)} className="w-full rounded-lg border border-[var(--flux-control-border)] bg-[var(--flux-surface-elevated)] px-2 py-1.5 text-xs text-[var(--flux-text)]">
                  <option value="">Destino</option>
                  {model.nodes.map((n) => (
                    <option key={n.id} value={n.id}>{n.label}</option>
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
                  Remover selecionado
                </button>
              ) : null}
              <p className="text-[11px] text-[var(--flux-bpmn-slate-caption)] dark:text-slate-400">
                {model.nodes.length} nós • {model.edges.length} fluxos
              </p>
            </>
          )}
        </aside>

        <div className="flex min-h-0 flex-1 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--flux-border-subtle)] bg-[var(--flux-surface-card)] px-3 py-2">
            <button type="button" className="btn-secondary text-xs" onClick={() => setSnapEnabled((v) => !v)}>
              Snap: {snapEnabled ? "ON" : "OFF"}
            </button>
            <span className="text-[11px] text-[var(--flux-text-muted)]">Roda: zoom · Alt+arrastar: pan · Área vazia: seleção.</span>
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
              setDragPreview({ x: Math.max(NODE_MIN_X, coords.x), y: Math.max(NODE_MIN_Y, coords.y) });
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
                const moving = model.nodes.find((n) => n.id === nodeDrag.ids[0]);
                if (!moving) return;
                const others = model.nodes.filter((n) => !nodeDrag.ids.includes(n.id));
                const aligned = snapEnabled
                  ? alignDeltaForNode(moving, others, baseDx, baseDy)
                  : { dx: baseDx, dy: baseDy, guides: [] as AlignGuide[] };
                setAlignGuides(snapEnabled ? aligned.guides : []);
                pendingDragDeltaRef.current = { dx: aligned.dx, dy: aligned.dy };
                if (dragRafRef.current == null) {
                  dragRafRef.current = requestAnimationFrame(() => {
                    dragRafRef.current = null;
                    const p = pendingDragDeltaRef.current;
                    if (p) setLiveDragDelta(p);
                  });
                }
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
            }}
            onPointerLeave={onCanvasPointerUp}
            className={`relative min-h-0 flex-1 cursor-crosshair overflow-hidden rounded-[var(--flux-rad-lg)] border border-[var(--flux-border-default)] bg-[var(--flux-surface-dark)] shadow-inner transition ${
              isCanvasDropActive ? "border-[var(--flux-primary)]/60 shadow-[0_0_0_2px_var(--flux-primary-alpha-18)]" : ""
            } ${isPanning ? "cursor-grabbing" : ""}`}
          >
            {/* Grid background — contained inside overflow:hidden, never bleeds outside */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 rounded-[inherit]"
              style={{
                backgroundImage: `linear-gradient(to right, ${bpmnGridLineFine} 1px, transparent 1px), linear-gradient(to bottom, ${bpmnGridLineFine} 1px, transparent 1px), linear-gradient(to right, ${bpmnGridLineBold} 1px, transparent 1px), linear-gradient(to bottom, ${bpmnGridLineBold} 1px, transparent 1px)`,
                backgroundSize: `${GRID_SIZE * zoom}px ${GRID_SIZE * zoom}px, ${GRID_SIZE * zoom}px ${GRID_SIZE * zoom}px, ${GRID_SIZE * 5 * zoom}px ${GRID_SIZE * 5 * zoom}px, ${GRID_SIZE * 5 * zoom}px ${GRID_SIZE * 5 * zoom}px`,
                backgroundPosition: `${((pan.x % (GRID_SIZE * zoom)) + GRID_SIZE * zoom) % (GRID_SIZE * zoom)}px ${((pan.y % (GRID_SIZE * zoom)) + GRID_SIZE * zoom) % (GRID_SIZE * zoom)}px, ${((pan.x % (GRID_SIZE * zoom)) + GRID_SIZE * zoom) % (GRID_SIZE * zoom)}px ${((pan.y % (GRID_SIZE * zoom)) + GRID_SIZE * zoom) % (GRID_SIZE * zoom)}px, ${((pan.x % (GRID_SIZE * 5 * zoom)) + GRID_SIZE * 5 * zoom) % (GRID_SIZE * 5 * zoom)}px ${((pan.y % (GRID_SIZE * 5 * zoom)) + GRID_SIZE * 5 * zoom) % (GRID_SIZE * 5 * zoom)}px, ${((pan.x % (GRID_SIZE * 5 * zoom)) + GRID_SIZE * 5 * zoom) % (GRID_SIZE * 5 * zoom)}px ${((pan.y % (GRID_SIZE * 5 * zoom)) + GRID_SIZE * 5 * zoom) % (GRID_SIZE * 5 * zoom)}px`,
              }}
            />
            {/* Canvas content — panned and zoomed */}
            <div
              className="absolute top-0 left-0"
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                transformOrigin: "0 0",
              }}
            >
              {model.lanes.map((lane, i) => {
                const top = lane.y ?? 12 + i * 140;
                const h = lane.height ?? 128;
                const defaultGradients = [
                  "linear-gradient(180deg, var(--flux-bpmn-green-800), var(--flux-bpmn-green-400))",
                  "linear-gradient(180deg, var(--flux-bpmn-teal-900), var(--flux-bpmn-teal-accent))",
                  "linear-gradient(180deg, var(--flux-bpmn-blue-800), var(--flux-bpmn-blue-400))",
                  "linear-gradient(180deg, var(--flux-bpmn-purple-800), var(--flux-bpmn-purple-400))",
                  "linear-gradient(180deg, var(--flux-bpmn-orange-900), var(--flux-bpmn-orange-400))",
                ];
                const grad = lane.gradient
                  ? `linear-gradient(180deg,${lane.gradient[0]},${lane.gradient[1]})`
                  : defaultGradients[i % 5];
                const tint = [
                  "color-mix(in srgb, var(--flux-bpmn-green-400) 6%, transparent)",
                  "color-mix(in srgb, var(--flux-bpmn-teal-accent) 4%, transparent)",
                  "color-mix(in srgb, var(--flux-bpmn-blue-400) 4%, transparent)",
                  "color-mix(in srgb, var(--flux-bpmn-purple-400) 4%, transparent)",
                  "color-mix(in srgb, var(--flux-bpmn-semantic-gateway) 4%, transparent)",
                ][i % 5];
                const border = [
                  "color-mix(in srgb, var(--flux-bpmn-green-400) 20%, transparent)",
                  "color-mix(in srgb, var(--flux-bpmn-teal-accent) 15%, transparent)",
                  "color-mix(in srgb, var(--flux-bpmn-blue-400) 15%, transparent)",
                  "color-mix(in srgb, var(--flux-bpmn-purple-400) 15%, transparent)",
                  "color-mix(in srgb, var(--flux-bpmn-semantic-gateway) 15%, transparent)",
                ][i % 5];
                const isDraggingThisLane = laneDrag?.laneId === lane.id;
                const isHovered = hoveredLaneId === lane.id;
                return (
                  <div
                    key={lane.id}
                    className="absolute left-1 right-1 overflow-visible rounded-md"
                    style={{
                      top,
                      height: h,
                      border: `2px solid ${isDraggingThisLane ? "color-mix(in srgb, var(--flux-chart-edge-selected) 60%, transparent)" : border}`,
                      background: tint,
                      borderRadius: 6,
                      boxShadow: isDraggingThisLane ? "var(--flux-bpmn-lane-drag-shadow)" : undefined,
                      zIndex: isDraggingThisLane ? 5 : 1,
                      transition: isDraggingThisLane ? "none" : "box-shadow 150ms",
                    }}
                    onMouseEnter={() => setHoveredLaneId(lane.id)}
                    onMouseLeave={() => setHoveredLaneId("")}
                  >
                    {/* Lane label bar — drag handle + inline edit on dblclick */}
                    <div
                      className={`${barlowCondensed.className} absolute bottom-0 left-0 top-0 flex w-[52px] select-none items-center justify-center rounded-l-md text-[14px] font-extrabold uppercase text-white`}
                      style={{
                        background: grad,
                        writingMode: "vertical-rl",
                        transform: "rotate(180deg)",
                        letterSpacing: "2px",
                        textOrientation: "mixed",
                        cursor: editingLaneId === lane.id ? "text" : isDraggingThisLane ? "grabbing" : "grab",
                      }}
                      onPointerDown={(e) => {
                        if (editingLaneId === lane.id) return; // let input handle it
                        e.stopPropagation();
                        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                        setLaneDrag({ laneId: lane.id, startClientY: e.clientY, originY: top });
                      }}
                      onPointerMove={(e) => {
                        if (!laneDragRef.current || laneDragRef.current.laneId !== lane.id) return;
                        e.stopPropagation();
                        const deltaCanvas = (e.clientY - laneDragRef.current.startClientY) / zoom;
                        const newY = Math.max(0, snap(laneDragRef.current.originY + deltaCanvas));
                        setModel((prev) => ({
                          ...prev,
                          lanes: prev.lanes.map((l) => l.id === lane.id ? { ...l, y: newY } : l),
                        }));
                      }}
                      onPointerUp={(e) => {
                        if (!laneDragRef.current || laneDragRef.current.laneId !== lane.id) return;
                        e.stopPropagation();
                        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
                        setModel((prev) => {
                          const next: BpmnModel = {
                            ...prev,
                            nodes: prev.nodes.map((n) => ({ ...n, laneId: laneForY(n.y, prev.lanes) })),
                          };
                          syncCodeFromModel(next);
                          return next;
                        });
                        setLaneDrag(null);
                      }}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        setEditingLaneId(lane.id);
                        setEditingLaneLabelInput(lane.label);
                      }}
                    >
                      {editingLaneId === lane.id ? (
                        <input
                          autoFocus
                          value={editingLaneLabelInput}
                          onChange={(e) => setEditingLaneLabelInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              const val = editingLaneLabelInput.trim() || lane.label;
                              setModel((prev) => ({
                                ...prev,
                                lanes: prev.lanes.map((l) => l.id === lane.id ? { ...l, label: val } : l),
                              }));
                              setEditingLaneId(null);
                            } else if (e.key === "Escape") {
                              setEditingLaneId(null);
                            }
                          }}
                          onBlur={() => {
                            const val = editingLaneLabelInput.trim() || lane.label;
                            setModel((prev) => ({
                              ...prev,
                              lanes: prev.lanes.map((l) => l.id === lane.id ? { ...l, label: val } : l),
                            }));
                            setEditingLaneId(null);
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="w-full bg-transparent text-center text-[11px] font-extrabold uppercase text-white outline-none placeholder:text-white/50"
                          style={{
                            writingMode: "vertical-rl",
                            textOrientation: "mixed",
                            transform: "rotate(0deg)",
                            letterSpacing: "1px",
                            width: "100%",
                            height: "100%",
                            padding: "4px 0",
                          }}
                        />
                      ) : (
                        <>
                          {lane.label}
                          {isHovered && !isDraggingThisLane && (
                            <span
                              className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-white/20 text-[10px] text-white"
                              style={{ writingMode: "horizontal-tb", transform: "none" }}
                              title="Duplo clique para editar"
                            >
                              ✎
                            </span>
                          )}
                        </>
                      )}
                    </div>

                    {/* Delete button — visible on hover */}
                    {isHovered && !isDraggingThisLane && (
                      <button
                        type="button"
                        title="Excluir swim lane"
                        className="absolute flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-[var(--flux-bpmn-pain-red)] text-[11px] font-bold text-white shadow-md transition hover:bg-[var(--flux-bpmn-pain-red-dark)] hover:scale-110"
                        style={{ top: 6, left: 6, zIndex: 20, lineHeight: 1 }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setModel((prev) => {
                            const next: BpmnModel = {
                              ...prev,
                              lanes: prev.lanes.filter((l) => l.id !== lane.id),
                              nodes: prev.nodes.map((n) => n.laneId === lane.id ? { ...n, laneId: undefined } : n),
                            };
                            syncCodeFromModel(next);
                            return next;
                          });
                          setHoveredLaneId("");
                        }}
                      >
                        ×
                      </button>
                    )}

                    {/* Resize handle at bottom edge */}
                    {isHovered && !isDraggingThisLane && (
                      <div
                        className="absolute bottom-0 left-[52px] right-0 flex h-3 cursor-ns-resize items-center justify-center"
                        title="Arrastar para redimensionar"
                        style={{ zIndex: 20 }}
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          const el = e.currentTarget as HTMLElement;
                          el.setPointerCapture(e.pointerId);
                          const originH = h;
                          const startY = e.clientY;
                          const pointerId = e.pointerId;
                          const onMove = ((ev: Event) => {
                            const pe = ev as unknown as PointerEvent;
                            const dh = (pe.clientY - startY) / zoom;
                            const newH = Math.max(80, snap(originH + dh));
                            setModel((prev) => ({
                              ...prev,
                              lanes: prev.lanes.map((l) => l.id === lane.id ? { ...l, height: newH } : l),
                            }));
                          }) as EventListener;
                          const onUp = () => {
                            try { el.releasePointerCapture(pointerId); } catch { /* ignore */ }
                            setModel((prev) => {
                              const next: BpmnModel = { ...prev, nodes: prev.nodes.map((n) => ({ ...n, laneId: laneForY(n.y, prev.lanes) })) };
                              syncCodeFromModel(next);
                              return next;
                            });
                            window.removeEventListener("pointermove", onMove);
                            window.removeEventListener("pointerup", onUp);
                          };
                          window.addEventListener("pointermove", onMove);
                          window.addEventListener("pointerup", onUp);
                        }}
                      >
                        <div className="h-1 w-10 rounded-full bg-slate-400/50" />
                      </div>
                    )}

                    {/* Tag badge */}
                    {lane.tag ? (
                      <span
                        className="absolute left-[68px] top-[10px] max-w-[min(360px,65%)] truncate rounded px-2.5 py-0.5 text-[12px] font-bold text-[var(--flux-bpmn-surface-label)]"
                        style={{
                          background: "var(--flux-bpmn-tag-pill-bg)",
                          boxShadow: "var(--flux-bpmn-tag-pill-shadow)",
                          letterSpacing: "0.5px",
                        }}
                      >
                        {lane.tag}
                      </span>
                    ) : null}
                  </div>
                );
              })}
              <svg className="absolute inset-0 h-full w-full" style={{ pointerEvents: showEdges ? "auto" : "none", opacity: showEdges ? 1 : 0 }}>
                <defs>
                  {(["default", "primary", "rework", "cross_lane", "system"] as const).map((k) => (
                    <marker
                      key={k}
                      id={`bpmnMk_${k}`}
                      viewBox="0 0 10 7"
                      refX="9"
                      refY="3.5"
                      markerWidth={10}
                      markerHeight={7}
                      orient="auto"
                    >
                      <polygon points="0 0, 10 3.5, 0 7" fill={BPMN_FLOW_EDGE_STYLES[k].marker} />
                    </marker>
                  ))}
                  <marker
                    id="bpmnArrowHeadPreview"
                    viewBox="0 0 10 10"
                    refX="9"
                    refY="5"
                    markerWidth={BPMN_VISUAL_TOKENS.sequenceArrowSize}
                    markerHeight={BPMN_VISUAL_TOKENS.sequenceArrowSize}
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--flux-bpmn-marker-preview-fill)" />
                  </marker>
                </defs>
                {edgesWithPoints.map((edge) => {
                  const kind = (edge as { kind?: BpmnEdgeKind }).kind ?? "default";
                  const style = BPMN_FLOW_EDGE_STYLES[kind];
                  const strokeSelected = selectedEdgeId === edge.id ? "var(--flux-chart-edge-selected)" : style.stroke;
                  const w = style.width;
                  const dash = style.dash;
                  const pts = edge.points;
                  const mid = pts[Math.floor(pts.length / 2)] ?? { x: 0, y: 0 };
                  return (
                  <g key={edge.id}>
                    <path
                      d={orthogonalPathFromPoints(edge.points)}
                      fill="none"
                      stroke={strokeSelected}
                      strokeWidth={selectedEdgeId === edge.id ? w + 0.5 : w}
                      strokeDasharray={dash}
                      markerEnd={`url(#bpmnMk_${kind})`}
                      className="cursor-pointer"
                      onPointerDown={() => {
                        setSelectedEdgeId(edge.id);
                        setSelectedWaypoint(null);
                        setSelectedNodeId("");
                        setSelectedNodeIds([]);
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
                    {edge.label ? (
                      <text
                        x={mid.x + 4}
                        y={mid.y - 4}
                        className="fill-[var(--flux-text-muted)]"
                        style={{ fontSize: 10, fontWeight: 700 }}
                      >
                        {edge.label}
                      </text>
                    ) : null}
                    {selectedEdgeId === edge.id &&
                      edge.waypoints.map((wp, idx) => (
                        <circle
                          key={`${edge.id}_wp_${idx}`}
                          cx={wp.x}
                          cy={wp.y}
                          r={4.5}
                          fill="var(--flux-bpmn-marker-preview-fill)"
                          stroke="var(--flux-bpmn-waypoint-stroke)"
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
                  );
                })}
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
                      stroke="var(--flux-chart-edge-selected)"
                      strokeWidth={BPMN_VISUAL_TOKENS.connectorStroke}
                      strokeDasharray="6 4"
                      markerEnd="url(#bpmnArrowHeadPreview)"
                    />
                  </g>
                ) : null}
              </svg>
              {model.nodes.map((node) => {
                const pe = nodesForEdges.find((n) => n.id === node.id) ?? node;
                const isDraggingThis = Boolean(nodeDrag?.ids.includes(node.id) && liveDragDelta !== null);
                return (
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
                    setSelectedEdgeId("");
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    if (dragRafRef.current != null) {
                      cancelAnimationFrame(dragRafRef.current);
                      dragRafRef.current = null;
                    }
                    pendingDragDeltaRef.current = null;
                    setNodeDrag(null);
                    setLiveDragDelta(null);
                    setAlignGuides([]);
                    setInlineEditNodeId(node.id);
                    setInlineTitle(node.label);
                    setInlineDesc(node.subtitle ?? "");
                    setSelectedNodeId(node.id);
                    setSelectedNodeIds([node.id]);
                    setEditingLabel(node.label);
                    setEditingLane(model.lanes.find((l) => l.id === node.laneId)?.label ?? "");
                    setSelectedEdgeId("");
                  }}
                  onPointerDown={(e) => {
                    if (connectingFromId) return;
                    if (e.button !== 0) return;
                    e.stopPropagation();
                    // Use pointer capture so drag never loses track of the pointer
                    (e.currentTarget as HTMLButtonElement).setPointerCapture(e.pointerId);
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
                    setLiveDragDelta({ dx: 0, dy: 0 });
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
                      const kind = inferEdgeKind(connectingFromId, node.id, prev.nodes);
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
                            ...(kind ? { kind } : {}),
                          } as BpmnModel["edges"][number],
                        ],
                      };
                      syncCodeFromModel(next);
                      return next;
                    });
                    setConnectingFromId("");
                    setConnectPreview(null);
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setContextMenu({ nodeId: node.id, x: e.clientX, y: e.clientY });
                    setSelectedNodeId(node.id);
                    setSelectedNodeIds([node.id]);
                  }}
                  className={`absolute px-2 py-1 text-left text-[11px] select-none touch-none ${
                    isDraggingThis
                      ? "z-[1000] cursor-grabbing"
                      : "cursor-grab hover:z-[100]"
                  } ${
                    selectedNodeSet.has(node.id) || selectedNodeId === node.id
                      ? "ring-2 ring-[var(--flux-primary)]/90 ring-offset-2 ring-offset-[var(--flux-surface-dark)]"
                      : ""
                  }`}
                  style={{
                    left: pe.x,
                    top: pe.y,
                    width: node.width ?? 110,
                    height: node.height ?? 54,
                    willChange: isDraggingThis ? "transform, left, top" : "auto",
                    transform: isDraggingThis
                      ? "scale(1.06)"
                      : selectedNodeSet.has(node.id) || selectedNodeId === node.id
                        ? "scale(1.02)"
                        : "scale(1)",
                    opacity: isDraggingThis ? 0.9 : 1,
                    transition: isDraggingThis
                      ? "transform 80ms ease-out, opacity 80ms ease-out"
                      : "transform 150ms cubic-bezier(0.22,1,0.36,1), box-shadow 150ms ease",
                    boxShadow: isDraggingThis
                      ? "var(--flux-bpmn-node-drag-shadow)"
                      : selectedNodeSet.has(node.id) || selectedNodeId === node.id
                        ? "var(--flux-bpmn-node-selected-shadow)"
                        : "var(--flux-bpmn-node-default-shadow)",
                  }}
                  title={node.tooltip || "Duplo clique para editar · Arraste para mover"}
                >
                  {isTaskLikeType(node.type) ? (
                    <>
                      {/* Task card background with border-left variant accent */}
                      <span
                        className="pointer-events-none absolute inset-0 rounded-[10px]"
                        style={{
                          borderLeft: `5px ${BPMN_TASK_VARIANT_STYLES[resolveBpmnTaskVariant(node.semanticVariant as string | undefined)].borderStyle} ${node.borderColor ?? BPMN_TASK_VARIANT_STYLES[resolveBpmnTaskVariant(node.semanticVariant as string | undefined)].accent}`,
                          backgroundColor: node.bgColor ?? BPMN_TASK_VARIANT_STYLES[resolveBpmnTaskVariant(node.semanticVariant as string | undefined)].bg,
                          borderTop: "1px solid var(--flux-bpmn-task-hairline)",
                          borderRight: "1px solid var(--flux-bpmn-task-hairline)",
                          borderBottom: "1px solid var(--flux-bpmn-task-hairline)",
                          borderTopRightRadius: 10,
                          borderBottomRightRadius: 10,
                          minWidth: 160,
                          maxWidth: 210,
                        }}
                      />
                      {/* Step number badge (.num) */}
                      {node.stepNumber ? (
                        <span
                          className="pointer-events-none absolute left-2 top-1.5 flex h-[22px] min-w-[22px] items-center justify-center rounded-full px-1 text-[10px] font-extrabold text-white"
                          style={{ background: BPMN_TASK_VARIANT_STYLES[resolveBpmnTaskVariant(node.semanticVariant as string | undefined)].badgeBg }}
                        >
                          {node.stepNumber}
                        </span>
                      ) : null}
                      {/* Pain badge (.pb) — top-right red circle */}
                      {node.painBadge ? (
                        <span
                          className="pointer-events-none absolute flex items-center justify-center rounded-full border-2 border-white font-extrabold text-white"
                          style={{
                            top: -10,
                            right: -10,
                            width: 26,
                            height: 26,
                            fontSize: 12,
                            background: "var(--flux-bpmn-pain-red)",
                            boxShadow: "0 2px 8px var(--flux-bpmn-pain-glow)",
                          }}
                        >
                          {node.painBadge}
                        </span>
                      ) : null}
                      {/* Label (.lb) */}
                      <span
                        className="pointer-events-none relative z-[1] block px-2 pt-2 text-center font-bold leading-snug"
                        style={{ fontSize: node.fontSize ?? 13, color: node.labelColor ?? "var(--flux-text)" }}
                      >
                        {node.label}
                      </span>
                      {/* Sublabel (.sb) */}
                      {node.subtitle ? (
                        <span className="pointer-events-none relative z-[1] block px-2 pb-2 text-center text-[10px] font-medium leading-tight text-[var(--flux-text-muted)]">{node.subtitle}</span>
                      ) : (
                        <span className="pointer-events-none relative z-[1] block px-2 pb-2 text-center text-[10px] text-[var(--flux-text-muted)]">{displayType(node.type)}</span>
                      )}
                    </>
                  ) : getBpmnVisualSpec(node.type).shape === "circle" ? (
                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 px-0.5">
                      <DeliveredEventGlyph nodeType={node.type} />
                      <span
                        className="max-w-[min(168px,100%)] text-center font-bold leading-tight"
                        style={{ fontSize: node.fontSize ?? 11, color: node.labelColor ?? "var(--flux-text)" }}
                      >{node.label}</span>
                    </div>
                  ) : getBpmnVisualSpec(node.type).shape === "diamond" ? (
                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1">
                      <DeliveredGatewayGlyph nodeType={node.type} />
                      <span
                        className="max-w-[min(168px,100%)] text-center font-bold leading-tight"
                        style={{ fontSize: node.fontSize ?? 11, color: node.labelColor ?? "var(--flux-text)" }}
                      >{node.label}</span>
                    </div>
                  ) : node.type === "annotation" ? (
                    /* Annotation default: annotation bg + gateway accent border */
                    <div
                      className="pointer-events-none absolute inset-0 flex flex-col justify-center px-3"
                      style={{
                        background: node.bgColor ?? "var(--flux-surface-elevated)",
                        borderLeft: `4px solid ${node.borderColor ?? "var(--flux-bpmn-semantic-gateway)"}`,
                        borderRadius: "0 10px 10px 0",
                      }}
                    >
                      <span
                        className="font-semibold leading-snug"
                        style={{ fontSize: node.fontSize ?? 11, color: node.labelColor ?? "var(--flux-text)" }}
                      >{node.label || "Anotação"}</span>
                      {node.subtitle && <span className="mt-0.5 text-[10px] text-[var(--flux-text-muted)]">{node.subtitle}</span>}
                    </div>
                  ) : node.type === "system_box" ? (
                    /* System box: elevated surface + dashed accent */
                    <div
                      className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 px-3"
                      style={{
                        background: node.bgColor ?? "var(--flux-surface-elevated)",
                        border: `2px dashed ${node.borderColor ?? "var(--flux-primary)"}`,
                        borderRadius: 10,
                      }}
                    >
                      <span className="text-[14px]">⚙</span>
                      <span
                        className="text-center font-bold leading-tight"
                        style={{ fontSize: node.fontSize ?? 12, color: node.labelColor ?? "var(--flux-primary-light)" }}
                      >{node.label || "Sistema"}</span>
                      {node.subtitle && <span className="text-center text-[10px] text-[var(--flux-text-muted)]">{node.subtitle}</span>}
                    </div>
                  ) : (
                    <>
                      <span
                        className={`absolute inset-0 ${node.type === "end_event" ? "border-2" : "border"} ${shapeClass(node.type)}`}
                        style={nodeStyle(node.type, selectedNodeSet.has(node.id) || selectedNodeId === node.id ? "selected" : "default")}
                      />
                      {getBpmnVisualSpec(node.type).borderStyle === "double" && getBpmnVisualSpec(node.type).shape === "circle" ? (
                        <span className="pointer-events-none absolute inset-[4px] rounded-full border border-white/45" aria-hidden />
                      ) : null}
                      <span
                        className={`pointer-events-none absolute left-1/2 top-[43%] -translate-x-1/2 -translate-y-1/2 text-white ${
                          isRotatedShape(node.type) ? "-rotate-45" : ""
                        }`}
                        aria-hidden
                        style={{ width: BPMN_VISUAL_TOKENS.iconSize, height: BPMN_VISUAL_TOKENS.iconSize }}
                      >
                        {renderBpmnIcon(getBpmnVisualSpec(node.type).icon)}
                      </span>
                      <span className={`relative block font-semibold truncate ${isRotatedShape(node.type) ? "-rotate-45" : ""}`}>{node.label}</span>
                      <span className={`relative block text-[10px] opacity-80 truncate ${isRotatedShape(node.type) ? "-rotate-45" : ""}`}>{displayType(node.type)}</span>
                    </>
                  )}
                  <span
                    role="button"
                    aria-label="Criar conexão"
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      const startX = pe.x + (node.width ?? 110);
                      const startY = pe.y + (node.height ?? 54) / 2;
                      setConnectingFromId(node.id);
                      setConnectPreview({ x: startX, y: startY });
                    }}
                    className="absolute -right-2 top-1/2 z-[2] h-3 w-3 rounded-full border border-[var(--flux-primary)] bg-[var(--flux-primary-light)]"
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
                    return (
                      <span
                        key={`${node.id}_${port}`}
                        className="absolute h-1.5 w-1.5 rounded-full border border-[var(--flux-primary)]/70 bg-[var(--flux-surface-card)]"
                        style={style}
                      />
                    );
                  })}
                </button>
                );
              })}
              {inlineEditNodeId ? (
                (() => {
                  const n = model.nodes.find((x) => x.id === inlineEditNodeId);
                  if (!n) return null;
                  const pos = nodesForEdges.find((x) => x.id === inlineEditNodeId) ?? n;
                  return (
                    <div
                      ref={inlineEditRef}
                      role="dialog"
                      aria-label="Editar elemento"
                      className="absolute z-[50] rounded-lg border border-[var(--flux-border-default)] bg-[var(--flux-surface-card)] p-3 shadow-[var(--flux-shadow-lg)]"
                      style={{
                        left: pos.x,
                        top: pos.y + (n.height ?? 54) + 8,
                      }}
                      onPointerDown={(e) => e.stopPropagation()}
                    >
                      <div className="text-[11px] font-semibold text-[var(--flux-text)]">Editar no canvas</div>
                      <label className="mt-2 block text-[10px] font-bold uppercase tracking-wide text-[var(--flux-text-muted)]">Título</label>
                      <input
                        className="mt-2 w-full min-w-[240px] rounded border border-[var(--flux-control-border)] bg-[var(--flux-surface-elevated)] px-2 py-1.5 text-[13px] text-[var(--flux-text)]"
                        value={inlineTitle}
                        onChange={(e) => setInlineTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Escape") {
                            e.preventDefault();
                            setInlineEditNodeId(null);
                          }
                          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                            e.preventDefault();
                            commitInlineEdit();
                          }
                        }}
                      />
                      <label className="mt-2 block text-[10px] font-bold uppercase tracking-wide text-[var(--flux-text-muted)]">Descrição</label>
                      <input
                        className="mt-2 w-full min-w-[240px] rounded border border-[var(--flux-control-border)] bg-[var(--flux-surface-elevated)] px-2 py-1.5 text-[12px] text-[var(--flux-text-muted)]"
                        value={inlineDesc}
                        onChange={(e) => setInlineDesc(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Escape") {
                            e.preventDefault();
                            setInlineEditNodeId(null);
                          }
                          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                            e.preventDefault();
                            commitInlineEdit();
                          }
                        }}
                        placeholder="Texto secundário (subtitle)"
                      />
                      <div className="mt-3 flex gap-2">
                        <button type="button" className="btn-secondary flex-1 text-xs" onClick={() => setInlineEditNodeId(null)}>
                          Cancelar
                        </button>
                        <button
                          type="button"
                          className="btn-secondary flex-1 text-xs"
                          style={{ background: "var(--flux-primary)", color: "var(--flux-text-on-primary)" }}
                          onClick={commitInlineEdit}
                        >
                          OK
                        </button>
                      </div>
                    </div>
                  );
                })()
              ) : null}
              {alignGuides.map((guide, idx) =>
                guide.axis === "x" ? (
                  <div key={`gx_${idx}`} className="absolute top-0 bottom-0 w-px bg-[var(--flux-primary)]/60" style={{ left: guide.value }} />
                ) : (
                  <div key={`gy_${idx}`} className="absolute left-0 right-0 h-px bg-[var(--flux-primary)]/60" style={{ top: guide.value }} />
                )
              )}
              {boxRect ? (
                <div
                  className="absolute border border-[var(--flux-primary)]/70 bg-[var(--flux-primary)]/10 pointer-events-none"
                  style={{ left: boxRect.left, top: boxRect.top, width: boxRect.width, height: boxRect.height }}
                />
              ) : null}
              {dragPreview && draggingType ? (
                <div
                  className="pointer-events-none absolute flex items-center gap-2 rounded-[10px] border border-dashed border-[var(--flux-primary)]/50 bg-[var(--flux-surface-card)]/90 px-2 py-1.5 shadow-[var(--flux-shadow-md)]"
                  style={{
                    left: dragPreview.x,
                    top: dragPreview.y,
                    width: stencilMeta(draggingType)?.width ?? 120,
                    minHeight: stencilMeta(draggingType)?.height ?? 56,
                  }}
                >
                  {getBpmnVisualSpec(draggingType).shape === "circle" ? (
                    <DeliveredEventGlyph nodeType={draggingType as BpmnNodeType} size={32} />
                  ) : getBpmnVisualSpec(draggingType).shape === "diamond" ? (
                    <DeliveredGatewayGlyph nodeType={draggingType as BpmnNodeType} size={30} />
                  ) : isTaskLikeType(draggingType) ? (
                    <span className="h-8 w-1 shrink-0 rounded-full bg-[var(--flux-primary)]" aria-hidden />
                  ) : (
                    <span className="h-6 w-6 shrink-0 rounded border border-[var(--flux-border-subtle)] bg-[var(--flux-surface-elevated)]" aria-hidden />
                  )}
                  <span className="text-[11px] font-bold text-[var(--flux-text)]">{displayType(draggingType)}</span>
                </div>
              ) : null}
            </div>
            <div className="absolute right-2 top-2 text-[10px] px-2 py-1 rounded bg-[var(--flux-surface-mid)]/80 text-[var(--flux-text-muted)]">
              zoom {(zoom * 100).toFixed(0)}% · ALT+drag/middle mouse para pan
            </div>
            {isCanvasDropActive ? (
              <div className="absolute left-3 top-3 rounded bg-[var(--flux-primary)]/20 border border-[var(--flux-primary)]/50 px-2 py-1 text-[10px] text-[var(--flux-primary-light)]">
                Solte para adicionar no board
              </div>
            ) : null}
            <div className="absolute right-3 bottom-3 w-[220px] h-[140px] rounded border border-[var(--flux-border-subtle)] bg-[var(--flux-surface-card)]/80 p-1.5 backdrop-blur-sm shadow-[var(--flux-shadow-md)]">
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
                {nodesForEdges.map((n) => {
                  const nx = ((n.x - miniMapBounds.minX) / miniMapBounds.width) * 100;
                  const ny = ((n.y - miniMapBounds.minY) / miniMapBounds.height) * 100;
                  const nw = (((n.width ?? 110) / miniMapBounds.width) * 100);
                  const nh = (((n.height ?? 54) / miniMapBounds.height) * 100);
                  return (
                    <span
                      key={`mini_${n.id}`}
                      className={`absolute rounded-sm ${selectedNodeSet.has(n.id) ? "bg-[var(--flux-primary)]/80" : "bg-[var(--flux-text)]/40"}`}
                      style={{ left: `${nx}%`, top: `${ny}%`, width: `${Math.max(nw, 1.5)}%`, height: `${Math.max(nh, 1.5)}%` }}
                    />
                  );
                })}
                {canvasRef.current ? (
                  <div
                    className="absolute border border-[var(--flux-primary)]/70 bg-[var(--flux-primary)]/8 pointer-events-none"
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

        <aside className={`flex min-h-0 flex-col gap-0 overflow-hidden rounded-xl border border-[var(--flux-border-default)] bg-[var(--flux-surface-card)] shadow-[var(--flux-shadow-md)] ${!isPropertiesVisible ? "p-2" : ""}`}>
          {!isPropertiesVisible ? (
            /* Collapsed strip — mirrors palette behaviour */
            <div className="flex flex-col items-center gap-2 pt-1">
              <button
                type="button"
                title="Mostrar propriedades"
                className="ml-auto rounded-md border border-[var(--flux-border-default)] bg-[var(--flux-surface-elevated)] px-1.5 py-0.5 text-[11px] font-bold text-[var(--flux-text-muted)] transition hover:border-[var(--flux-primary)]/60 hover:text-[var(--flux-primary-light)]"
                onClick={() => setIsPropertiesVisible(true)}
              >
                ◀
              </button>
              <span
                className="mt-1 select-none text-[9px] font-extrabold uppercase tracking-widest text-[var(--flux-text-muted)]"
                style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
              >
                Propriedades
              </span>
            </div>
          ) : (
          <>
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--flux-border-muted)] p-3">
            <p className="text-[11px] font-extrabold uppercase tracking-wide text-[var(--flux-text)]">Propriedades</p>
            <button
              type="button"
              className="rounded-md border border-[var(--flux-border-default)] bg-[var(--flux-surface-elevated)] px-1.5 py-0.5 text-[11px] font-bold text-[var(--flux-text-muted)] transition hover:border-[var(--flux-primary)]/60 hover:text-[var(--flux-primary-light)]"
              onClick={() => setIsPropertiesVisible(false)}
            >
              ▶
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {selectedEdge ? (
            <>
              <div className="space-y-1">
                <label className="text-[11px] text-[var(--flux-text-muted)]">ID do fluxo</label>
                <input value={selectedEdge.id} disabled className="w-full px-2 py-1.5 rounded-[var(--flux-rad)] bg-[var(--flux-surface-dark)] border border-[var(--flux-control-border)] text-xs opacity-80" />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] text-[var(--flux-text-muted)]">Rótulo (ex.: Sim / Não)</label>
                <input
                  key={selectedEdge.id}
                  defaultValue={selectedEdge.label ?? ""}
                  onBlur={(e) => updateSelectedEdge({ label: e.target.value.trim() || undefined })}
                  className="w-full px-2 py-1.5 rounded-[var(--flux-rad)] bg-[var(--flux-surface-elevated)] border border-[var(--flux-control-border)] text-xs"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] text-[var(--flux-text-muted)]">Tipo de fluxo</label>
                <select
                  value={selectedEdge.kind ?? "default"}
                  onChange={(e) => {
                    const v = e.target.value;
                    updateSelectedEdge({ kind: v === "default" ? undefined : (v as BpmnEdgeKind) });
                  }}
                  className="w-full px-2 py-1.5 rounded-[var(--flux-rad)] bg-[var(--flux-surface-elevated)] border border-[var(--flux-control-border)] text-xs"
                >
                  <option value="default">Padrão (cinza)</option>
                  <option value="primary">Principal (lime)</option>
                  <option value="rework">Retrabalho (vermelho)</option>
                  <option value="cross_lane">Entre raias (teal)</option>
                  <option value="system">Sistema (azul)</option>
                </select>
              </div>
            </>
          ) : !selectedNode ? (
            <p className="text-xs text-[var(--flux-text-muted)]">Selecione um elemento ou fluxo no canvas.</p>
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
              {isTaskLikeType(selectedNode.type) ? (
                <>
                  <div className="space-y-1">
                    <label className="text-[11px] text-[var(--flux-text-muted)]">Subtítulo</label>
                    <input
                      value={editingSubtitle}
                      onChange={(e) => setEditingSubtitle(e.target.value)}
                      onBlur={() => updateSelectedNode({ subtitle: editingSubtitle.trim() || undefined })}
                      className="w-full px-2 py-1.5 rounded-[var(--flux-rad)] bg-[var(--flux-surface-elevated)] border border-[var(--flux-control-border)] text-xs"
                      placeholder="Ator, sistema, detalhe"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-[11px] text-[var(--flux-text-muted)]">Nº passo</label>
                      <input
                        value={editingStep}
                        onChange={(e) => setEditingStep(e.target.value)}
                        onBlur={() => updateSelectedNode({ stepNumber: editingStep.trim() || undefined })}
                        className="w-full px-2 py-1.5 rounded-[var(--flux-rad)] bg-[var(--flux-surface-elevated)] border border-[var(--flux-control-border)] text-xs"
                        placeholder="1, A…"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] text-[var(--flux-text-muted)]">Pain badge</label>
                      <input
                        value={editingPain}
                        onChange={(e) => setEditingPain(e.target.value)}
                        onBlur={() => updateSelectedNode({ painBadge: editingPain.trim() || undefined })}
                        className="w-full px-2 py-1.5 rounded-[var(--flux-rad)] bg-[var(--flux-surface-elevated)] border border-[var(--flux-control-border)] text-xs"
                        placeholder="1–9"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] text-[var(--flux-text-muted)]">Variante visual</label>
                    <select
                      value={selectedNode.semanticVariant ?? "default"}
                      onChange={(e) => {
                        const v = e.target.value;
                        updateSelectedNode({ semanticVariant: v === "default" ? undefined : (v as BpmnSemanticVariant) });
                      }}
                      className="w-full px-2 py-1.5 rounded-[var(--flux-rad)] bg-[var(--flux-surface-elevated)] border border-[var(--flux-control-border)] text-xs"
                    >
                      <option value="default">Padrão / manual</option>
                      <option value="delivered">Implementada / entregue</option>
                      <option value="automation">API / automação</option>
                      <option value="pain">Pain point</option>
                      <option value="system">Sistema (tracejado)</option>
                    </select>
                  </div>
                </>
              ) : null}
              {/* Aparência — fonte e cores */}
              <div className="rounded-lg border border-[var(--flux-border-default)] bg-[var(--flux-surface-elevated)] p-2.5 space-y-2.5">
                <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--flux-text-muted)]">Aparência <span className="ml-1 font-normal normal-case opacity-70">[/] = tam. fonte · clique na cor</span></p>
                {/* Font size stepper */}
                <div className="flex items-center gap-2">
                  <label className="text-[11px] text-[var(--flux-text-muted)] w-20 shrink-0">Tam. fonte</label>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      title="Diminuir fonte ([)"
                      className="flex h-7 w-7 items-center justify-center rounded border border-[var(--flux-control-border)] bg-[var(--flux-surface-card)] text-xs font-bold text-[var(--flux-text-muted)] hover:border-[var(--flux-primary)]/50 hover:text-[var(--flux-primary-light)]"
                      onClick={() => updateSelectedNode({ fontSize: Math.max(8, (selectedNode.fontSize ?? 13) - 1) })}
                    >−</button>
                    <span className="w-8 text-center text-[11px] font-mono font-bold text-[var(--flux-text)]">
                      {selectedNode.fontSize ?? 13}
                    </span>
                    <button
                      type="button"
                      title="Aumentar fonte (])"
                      className="flex h-7 w-7 items-center justify-center rounded border border-[var(--flux-control-border)] bg-[var(--flux-surface-card)] text-xs font-bold text-[var(--flux-text-muted)] hover:border-[var(--flux-primary)]/50 hover:text-[var(--flux-primary-light)]"
                      onClick={() => updateSelectedNode({ fontSize: Math.min(32, (selectedNode.fontSize ?? 13) + 1) })}
                    >+</button>
                    {selectedNode.fontSize !== undefined && (
                      <button type="button" className="ml-1 text-[10px] text-[var(--flux-text-muted)] hover:text-[var(--flux-danger)]" title="Resetar" onClick={() => updateSelectedNode({ fontSize: undefined })}>↺</button>
                    )}
                  </div>
                </div>
                {/* Label color */}
                <div className="flex items-center gap-2">
                  <label className="text-[11px] text-[var(--flux-text-muted)] w-20 shrink-0">Cor do texto</label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="color"
                      value={
                        /^#[0-9a-fA-F]{6}$/i.test((selectedNode.labelColor ?? "").trim())
                          ? (selectedNode.labelColor ?? "").trim()
                          : "#" + "F0EEFF"
                      }
                      onChange={(e) => updateSelectedNode({ labelColor: e.target.value })}
                      className="h-7 w-10 cursor-pointer rounded border border-[var(--flux-control-border)] p-0.5"
                      title="Cor do texto (Ctrl+Shift+T)"
                    />
                    <div className="flex gap-1">
                      {[
                        "var(--flux-text)",
                        "var(--flux-text-on-primary)",
                        "var(--flux-bpmn-prop-lavender)",
                        "var(--flux-danger)",
                        "var(--flux-info)",
                      ].map((c) => (
                        <button
                          key={c}
                          type="button"
                          title={c}
                          className="h-5 w-5 rounded-full border-2 border-[var(--flux-border-subtle)] shadow-sm transition hover:scale-110"
                          style={{ background: c }}
                          onClick={() => updateSelectedNode({ labelColor: c })}
                        />
                      ))}
                    </div>
                    {selectedNode.labelColor !== undefined && (
                      <button type="button" className="text-[10px] text-[var(--flux-text-muted)] hover:text-[var(--flux-danger)]" title="Resetar" onClick={() => updateSelectedNode({ labelColor: undefined })}>↺</button>
                    )}
                  </div>
                </div>
                {/* Background color */}
                <div className="flex items-center gap-2">
                  <label className="text-[11px] text-[var(--flux-text-muted)] w-20 shrink-0">Cor de fundo</label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="color"
                      value={
                        /^#[0-9a-fA-F]{6}$/i.test((selectedNode.bgColor ?? "").trim())
                          ? (selectedNode.bgColor ?? "").trim()
                          : "#" + "221F3A"
                      }
                      onChange={(e) => updateSelectedNode({ bgColor: e.target.value })}
                      className="h-7 w-10 cursor-pointer rounded border border-[var(--flux-control-border)] p-0.5"
                      title="Cor de fundo"
                    />
                    <div className="flex gap-1">
                      {[
                        "var(--flux-bpmn-prop-bg)",
                        "var(--flux-bpmn-prop-bg-alt)",
                        "var(--flux-bpmn-prop-bg-deep)",
                        "var(--flux-bpmn-prop-mint)",
                        "var(--flux-bpmn-prop-cyan-tint)",
                        "var(--flux-bpmn-prop-rose)",
                      ].map((c) => (
                        <button
                          key={c}
                          type="button"
                          title={c}
                          className="h-5 w-5 rounded-full border-2 border-[var(--flux-border-subtle)] shadow-sm transition hover:scale-110"
                          style={{ background: c }}
                          onClick={() => updateSelectedNode({ bgColor: c })}
                        />
                      ))}
                    </div>
                    {selectedNode.bgColor !== undefined && (
                      <button type="button" className="text-[10px] text-[var(--flux-text-muted)] hover:text-[var(--flux-danger)]" title="Resetar" onClick={() => updateSelectedNode({ bgColor: undefined })}>↺</button>
                    )}
                  </div>
                </div>
                {/* Border / accent color */}
                <div className="flex items-center gap-2">
                  <label className="text-[11px] text-[var(--flux-text-muted)] w-20 shrink-0">Cor da borda</label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="color"
                      value={
                        /^#[0-9a-fA-F]{6}$/i.test((selectedNode.borderColor ?? "").trim())
                          ? (selectedNode.borderColor ?? "").trim()
                          : "#" + "6C5CE7"
                      }
                      onChange={(e) => updateSelectedNode({ borderColor: e.target.value })}
                      className="h-7 w-10 cursor-pointer rounded border border-[var(--flux-control-border)] p-0.5"
                      title="Cor da borda / acento"
                    />
                    <div className="flex gap-1">
                      {[
                        "var(--flux-bpmn-prop-border)",
                        "var(--flux-bpmn-prop-lavender)",
                        "var(--flux-secondary)",
                        "var(--flux-danger)",
                        "var(--flux-info)",
                        "var(--flux-warning)",
                      ].map((c) => (
                        <button
                          key={c}
                          type="button"
                          title={c}
                          className="h-5 w-5 rounded-full border-2 border-[var(--flux-border-subtle)] shadow-sm transition hover:scale-110"
                          style={{ background: c }}
                          onClick={() => updateSelectedNode({ borderColor: c })}
                        />
                      ))}
                    </div>
                    {selectedNode.borderColor !== undefined && (
                      <button type="button" className="text-[10px] text-[var(--flux-text-muted)] hover:text-[var(--flux-danger)]" title="Resetar" onClick={() => updateSelectedNode({ borderColor: undefined })}>↺</button>
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] text-[var(--flux-text-muted)]">Dica (tooltip)</label>
                <textarea
                  value={editingTooltip}
                  onChange={(e) => setEditingTooltip(e.target.value)}
                  onBlur={() => updateSelectedNode({ tooltip: editingTooltip.trim() || undefined })}
                  rows={3}
                  className="w-full px-2 py-1.5 rounded-[var(--flux-rad)] bg-[var(--flux-surface-elevated)] border border-[var(--flux-control-border)] text-xs"
                  placeholder="Texto ao passar o mouse"
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
                <>
                  <div className="space-y-1">
                    <label className="text-[11px] text-[var(--flux-text-muted)]">Lane</label>
                    <input
                      value={editingLane}
                      onChange={(e) => setEditingLane(e.target.value)}
                      onBlur={updateLaneLabel}
                      className="w-full px-2 py-1.5 rounded-[var(--flux-rad)] bg-[var(--flux-surface-elevated)] border border-[var(--flux-control-border)] text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] text-[var(--flux-text-muted)]">Tag da raia</label>
                    <input
                      value={editingLaneTag}
                      onChange={(e) => setEditingLaneTag(e.target.value)}
                      onBlur={updateLaneTag}
                      className="w-full px-2 py-1.5 rounded-[var(--flux-rad)] bg-[var(--flux-surface-elevated)] border border-[var(--flux-control-border)] text-xs"
                      placeholder="Ex.: AS-IS — Área de negócio"
                    />
                  </div>
                </>
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
          </div>
          <div className="shrink-0 border-t border-[var(--flux-border-muted)] p-3">
            <BpmnLegend expanded={legendExpanded} onToggleExpanded={() => setLegendExpanded((v) => !v)} />
          </div>
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

      {/* ── Context Menu ────────────────────────────────────────────────── */}
      {contextMenu && (() => {
        const cmNode = model.nodes.find((n) => n.id === contextMenu.nodeId);
        if (!cmNode) return null;
        return (
          <>
            {/* backdrop to close */}
            <div className="fixed inset-0 z-[1990]" onClick={() => setContextMenu(null)} onContextMenu={(e) => { e.preventDefault(); setContextMenu(null); }} />
            <div
              className="fixed z-[2000] min-w-[200px] overflow-hidden rounded-xl border border-[var(--flux-border-default)] bg-[var(--flux-surface-card)] shadow-[var(--flux-shadow-xl)]"
              style={{ left: contextMenu.x, top: contextMenu.y }}
            >
              <div className="border-b border-[var(--flux-border-muted)] px-3 py-2">
                <p className="max-w-[180px] truncate text-[11px] font-bold text-[var(--flux-text)]">{cmNode.label}</p>
                <p className="text-[10px] text-[var(--flux-text-muted)]">{cmNode.type}</p>
              </div>
              <div className="py-1">
                {[
                  { label: "Editar inline", icon: "✎", action: () => { setInlineEditNodeId(cmNode.id); setInlineTitle(cmNode.label); setInlineDesc(cmNode.subtitle ?? ""); setEditingLabel(cmNode.label); } },
                  { label: "Duplicar  Ctrl+D", icon: "⿻", action: () => {
                    setModel((prev) => {
                      const clone = { ...cmNode, id: `${cmNode.type}_${Math.random().toString(36).slice(2,7)}`, x: cmNode.x + 40, y: cmNode.y + 40, label: `${cmNode.label} cópia` };
                      const next: BpmnModel = { ...prev, nodes: [...prev.nodes, clone] };
                      syncCodeFromModel(next);
                      setSelectedNodeId(clone.id); setSelectedNodeIds([clone.id]);
                      return next;
                    });
                  }},
                  { label: "Tamanho fonte  [ ]", icon: "A", action: () => {} },
                  { label: "Aumentar fonte", icon: "+", action: () => { updateSelectedNode({ fontSize: Math.min(32, (cmNode.fontSize ?? 13) + 1) }); } },
                  { label: "Diminuir fonte", icon: "−", action: () => { updateSelectedNode({ fontSize: Math.max(8, (cmNode.fontSize ?? 13) - 1) }); } },
                  { label: "Remover", icon: "🗑", danger: true, action: () => {
                    setModel((prev) => {
                      const next: BpmnModel = { ...prev, nodes: prev.nodes.filter((n) => n.id !== cmNode.id), edges: prev.edges.filter((e) => e.sourceId !== cmNode.id && e.targetId !== cmNode.id) };
                      syncCodeFromModel(next);
                      setSelectedNodeId(""); setSelectedNodeIds([]);
                      return next;
                    });
                  }},
                ].map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    className={`flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[12px] font-medium transition hover:bg-[var(--flux-surface-elevated)] ${
                      (item as { danger?: boolean }).danger ? "text-[var(--flux-danger)]" : "text-[var(--flux-text)]"
                    }`}
                    onClick={() => { (item as { action: () => void }).action(); setContextMenu(null); }}
                  >
                    <span className="w-4 text-center text-[13px]">{item.icon}</span>
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </>
        );
      })()}
    </div>
  );
}

