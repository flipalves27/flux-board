"use client";

import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import type { Node, Edge, OnNodesChange, OnEdgesChange } from "@xyflow/react";
import { applyNodeChanges, applyEdgeChanges } from "@xyflow/react";
import type {
  BpmnNodeType,
  BpmnEdgeKind,
  BpmnSemanticVariant,
  BpmnLane,
  BpmnTemplateModel,
  BpmnValidationIssue,
} from "@/lib/bpmn-types";
import { validateBpmnModel } from "@/lib/bpmn-types";
import { bpmnModelToMarkdown, bpmnModelToXml } from "@/lib/bpmn-io";

/* ------------------------------------------------------------------ */
/*  Node / Edge data payloads                                         */
/* ------------------------------------------------------------------ */

export type BpmnNodeData = {
  bpmnType: BpmnNodeType;
  label: string;
  subtitle?: string;
  stepNumber?: string;
  semanticVariant?: BpmnSemanticVariant;
  tooltip?: string;
  painBadge?: string;
  laneId?: string;
  fontSize?: number;
  labelColor?: string;
  bgColor?: string;
  borderColor?: string;
};

export type BpmnEdgeData = {
  bpmnKind?: BpmnEdgeKind;
  label?: string;
};

export type BpmnFlowNode = Node<BpmnNodeData>;
export type BpmnFlowEdge = Edge<BpmnEdgeData>;

/* ------------------------------------------------------------------ */
/*  History snapshot                                                   */
/* ------------------------------------------------------------------ */

type HistorySnapshot = {
  nodes: BpmnFlowNode[];
  edges: BpmnFlowEdge[];
  lanes: BpmnLane[];
};

const HISTORY_LIMIT = 80;
const GRID_SIZE = 20;

/* ------------------------------------------------------------------ */
/*  Store shape                                                        */
/* ------------------------------------------------------------------ */

type BpmnStoreState = {
  /** React Flow nodes — the single source of truth for the canvas. */
  nodes: BpmnFlowNode[];
  edges: BpmnFlowEdge[];
  lanes: BpmnLane[];
  modelName: string;

  /* UI toggles */
  boardId: string;
  paletteCollapsed: boolean;
  propertiesVisible: boolean;
  showEdges: boolean;
  legendExpanded: boolean;
  presentMode: boolean;
  codeVisible: boolean;
  codeTab: "markdown" | "xml";
  snapEnabled: boolean;

  /* Selection */
  selectedNodeIds: string[];
  selectedEdgeId: string;

  /* Validation */
  issues: BpmnValidationIssue[];

  /* Code sync */
  markdown: string;
  xml: string;

  /* History */
  history: HistorySnapshot[];
  historyIndex: number;

  /* Busy / save states */
  busy: boolean;
  savingBoard: boolean;
};

type BpmnStoreActions = {
  /* React Flow change handlers */
  onNodesChange: OnNodesChange<BpmnFlowNode>;
  onEdgesChange: OnEdgesChange<BpmnFlowEdge>;
  setNodes: (nodes: BpmnFlowNode[]) => void;
  setEdges: (edges: BpmnFlowEdge[]) => void;

  /* Node actions */
  addNode: (node: BpmnFlowNode) => void;
  removeNodes: (ids: string[]) => void;
  updateNodeData: (id: string, patch: Partial<BpmnNodeData>) => void;
  duplicateNodes: (ids: string[]) => void;

  /* Edge actions */
  addEdge: (edge: BpmnFlowEdge) => void;
  removeEdge: (id: string) => void;
  updateEdgeData: (id: string, patch: Partial<BpmnEdgeData>) => void;

  /* Lane actions */
  addLane: () => void;
  removeLane: (id: string) => void;
  updateLane: (id: string, patch: Partial<BpmnLane>) => void;

  /* Selection */
  setSelectedNodeIds: (ids: string[]) => void;
  setSelectedEdgeId: (id: string) => void;
  clearSelection: () => void;

  /* UI */
  setBoardId: (id: string) => void;
  setPaletteCollapsed: (v: boolean) => void;
  setPropertiesVisible: (v: boolean) => void;
  setShowEdges: (v: boolean) => void;
  setLegendExpanded: (v: boolean) => void;
  setPresentMode: (v: boolean) => void;
  setCodeVisible: (v: boolean) => void;
  setCodeTab: (tab: "markdown" | "xml") => void;
  setSnapEnabled: (v: boolean) => void;
  setBusy: (v: boolean) => void;
  setSavingBoard: (v: boolean) => void;

  /* History */
  pushHistory: () => void;
  undo: () => void;
  redo: () => void;

  /* Code sync */
  syncCode: () => void;
  setMarkdown: (v: string) => void;
  setXml: (v: string) => void;

  /* Validation */
  validate: () => void;

  /* Model import / export */
  toBpmnModel: () => BpmnTemplateModel;
  loadFromModel: (model: BpmnTemplateModel) => void;

  /* Set model name */
  setModelName: (name: string) => void;
};

export type BpmnStore = BpmnStoreState & BpmnStoreActions;

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function snap(v: number): number {
  return Math.round(v / GRID_SIZE) * GRID_SIZE;
}

function uid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 7)}`;
}

function laneForY(y: number, lanes: BpmnLane[]): string | undefined {
  const sorted = [...lanes].sort((a, b) => (a.y ?? 0) - (b.y ?? 0));
  return sorted.find((l) => {
    const top = l.y ?? 0;
    const h = l.height ?? 128;
    return y >= top && y <= top + h;
  })?.id;
}

function nodeToModelNode(n: BpmnFlowNode): BpmnTemplateModel["nodes"][number] {
  const d = n.data;
  return {
    id: n.id,
    type: d.bpmnType,
    label: d.label,
    x: snap(n.position.x),
    y: snap(n.position.y),
    width: n.measured?.width ?? (n.style?.width as number | undefined) ?? 160,
    height: n.measured?.height ?? (n.style?.height as number | undefined) ?? 60,
    laneId: d.laneId,
    subtitle: d.subtitle,
    stepNumber: d.stepNumber,
    semanticVariant: d.semanticVariant,
    tooltip: d.tooltip,
    painBadge: d.painBadge,
    fontSize: d.fontSize,
    labelColor: d.labelColor,
    bgColor: d.bgColor,
    borderColor: d.borderColor,
  };
}

function edgeToModelEdge(e: BpmnFlowEdge): BpmnTemplateModel["edges"][number] {
  return {
    id: e.id,
    sourceId: e.source,
    targetId: e.target,
    label: e.data?.label ?? (typeof e.label === "string" ? e.label : undefined),
    kind: e.data?.bpmnKind,
    sourcePort: e.sourceHandle as BpmnTemplateModel["edges"][number]["sourcePort"],
    targetPort: e.targetHandle as BpmnTemplateModel["edges"][number]["targetPort"],
  };
}

function modelNodeToFlowNode(n: BpmnTemplateModel["nodes"][number]): BpmnFlowNode {
  const isEvent = n.type.includes("event");
  const isGateway = n.type.includes("gateway");
  const w = n.width ?? (isEvent ? 44 : isGateway ? 56 : 160);
  const h = n.height ?? (isEvent ? 44 : isGateway ? 56 : 60);

  return {
    id: n.id,
    type: n.type,
    position: { x: n.x, y: n.y },
    data: {
      bpmnType: n.type,
      label: n.label,
      subtitle: n.subtitle,
      stepNumber: n.stepNumber,
      semanticVariant: n.semanticVariant,
      tooltip: n.tooltip,
      painBadge: n.painBadge,
      laneId: n.laneId,
      fontSize: n.fontSize,
      labelColor: n.labelColor,
      bgColor: n.bgColor,
      borderColor: n.borderColor,
    },
    style: { width: w, height: h },
    ...(n.type === "annotation" || n.type === "system_box" || n.type === "data_object"
      ? {}
      : {}),
  };
}

function modelEdgeToFlowEdge(e: BpmnTemplateModel["edges"][number]): BpmnFlowEdge {
  return {
    id: e.id,
    source: e.sourceId,
    target: e.targetId,
    type: "orthogonal",
    sourceHandle: e.sourcePort ?? undefined,
    targetHandle: e.targetPort ?? undefined,
    data: {
      bpmnKind: e.kind,
      label: e.label,
    },
    label: e.label,
  };
}

/* ------------------------------------------------------------------ */
/*  Default initial model                                              */
/* ------------------------------------------------------------------ */

const DEFAULT_LANES: BpmnLane[] = [
  { id: "solicitante", label: "Solicitante", y: 12, height: 160, gradient: ["#00695C", "#00897B"] },
  { id: "processamento", label: "Processamento", y: 192, height: 160, gradient: ["#1565C0", "#42A5F5"] },
];

const DEFAULT_MODEL: BpmnTemplateModel = {
  version: "bpmn-2.0-lite",
  name: "Novo diagrama BPMN",
  lanes: DEFAULT_LANES,
  nodes: [
    { id: "start_1", type: "start_event", label: "Início", x: 130, y: 60, laneId: "solicitante", width: 44, height: 44 },
    { id: "task_1", type: "task", label: "Analisar solicitação", x: 260, y: 50, laneId: "solicitante", width: 160, height: 60, stepNumber: "1", subtitle: "Responsável" },
    { id: "gw_1", type: "exclusive_gateway", label: "Aprovado?", x: 510, y: 230, laneId: "processamento", width: 56, height: 56 },
    { id: "task_2", type: "task", label: "Processar", x: 660, y: 220, laneId: "processamento", width: 140, height: 60, stepNumber: "2", semanticVariant: "reborn" },
    { id: "task_3", type: "task", label: "Notificar resultado", x: 660, y: 300, laneId: "processamento", width: 150, height: 60, stepNumber: "3" },
    { id: "end_1", type: "end_event", label: "Fim", x: 900, y: 250, laneId: "processamento", width: 44, height: 44 },
  ],
  edges: [
    { id: "flow_1", sourceId: "start_1", targetId: "task_1", kind: "primary" },
    { id: "flow_2", sourceId: "task_1", targetId: "gw_1", kind: "primary" },
    { id: "flow_3", sourceId: "gw_1", targetId: "task_2", kind: "primary", label: "Sim" },
    { id: "flow_4", sourceId: "gw_1", targetId: "task_3", kind: "rework", label: "Não" },
    { id: "flow_5", sourceId: "task_2", targetId: "end_1", kind: "primary" },
    { id: "flow_6", sourceId: "task_3", targetId: "end_1" },
  ],
};

const initialNodes = DEFAULT_MODEL.nodes.map(modelNodeToFlowNode);
const initialEdges = DEFAULT_MODEL.edges.map(modelEdgeToFlowEdge);

/* ------------------------------------------------------------------ */
/*  Store                                                              */
/* ------------------------------------------------------------------ */

const devEnabled = process.env.NODE_ENV === "development";

export const useBpmnStore = create<BpmnStore>()(
  devtools(
    immer((set, get) => ({
      /* ---- state ---- */
      nodes: initialNodes,
      edges: initialEdges,
      lanes: DEFAULT_LANES,
      modelName: DEFAULT_MODEL.name,

      boardId: "",
      paletteCollapsed: false,
      propertiesVisible: true,
      showEdges: true,
      legendExpanded: false,
      presentMode: false,
      codeVisible: false,
      codeTab: "markdown" as const,
      snapEnabled: true,

      selectedNodeIds: [],
      selectedEdgeId: "",

      issues: [],
      markdown: "",
      xml: "",

      history: [{ nodes: initialNodes, edges: initialEdges, lanes: DEFAULT_LANES }],
      historyIndex: 0,

      busy: false,
      savingBoard: false,

      /* ---- React Flow handlers ---- */
      onNodesChange: (changes) => {
        set((s) => {
          s.nodes = applyNodeChanges(changes, s.nodes) as BpmnFlowNode[];
        });
      },
      onEdgesChange: (changes) => {
        set((s) => {
          s.edges = applyEdgeChanges(changes, s.edges) as BpmnFlowEdge[];
        });
      },
      setNodes: (nodes) => set({ nodes }),
      setEdges: (edges) => set({ edges }),

      /* ---- Node actions ---- */
      addNode: (node) => {
        set((s) => {
          s.nodes.push(node);
        });
        get().pushHistory();
        get().syncCode();
      },

      removeNodes: (ids) => {
        const idSet = new Set(ids);
        set((s) => {
          s.nodes = s.nodes.filter((n) => !idSet.has(n.id));
          s.edges = s.edges.filter((e) => !idSet.has(e.source) && !idSet.has(e.target));
          s.selectedNodeIds = s.selectedNodeIds.filter((id) => !idSet.has(id));
          if (ids.includes(s.selectedEdgeId)) s.selectedEdgeId = "";
        });
        get().pushHistory();
        get().syncCode();
      },

      updateNodeData: (id, patch) => {
        set((s) => {
          const node = s.nodes.find((n) => n.id === id);
          if (node) Object.assign(node.data, patch);
        });
        get().syncCode();
      },

      duplicateNodes: (ids) => {
        const state = get();
        const clones: BpmnFlowNode[] = [];
        const idMap = new Map<string, string>();

        for (const id of ids) {
          const orig = state.nodes.find((n) => n.id === id);
          if (!orig) continue;
          const newId = uid(orig.data.bpmnType.replace(/[^a-z_]/g, ""));
          idMap.set(id, newId);
          clones.push({
            ...structuredClone(orig),
            id: newId,
            position: { x: snap(orig.position.x + 40), y: snap(orig.position.y + 40) },
            data: { ...orig.data, label: `${orig.data.label} cópia` },
            selected: true,
          });
        }

        const clonedEdges: BpmnFlowEdge[] = state.edges
          .filter((e) => idMap.has(e.source) && idMap.has(e.target))
          .map((e) => ({
            ...structuredClone(e),
            id: uid("flow"),
            source: idMap.get(e.source)!,
            target: idMap.get(e.target)!,
          }));

        set((s) => {
          for (const n of s.nodes) n.selected = false;
          s.nodes.push(...clones);
          s.edges.push(...clonedEdges);
          s.selectedNodeIds = clones.map((c) => c.id);
        });
        get().pushHistory();
        get().syncCode();
      },

      /* ---- Edge actions ---- */
      addEdge: (edge) => {
        set((s) => {
          if (s.edges.some((e) => e.source === edge.source && e.target === edge.target)) return;
          s.edges.push(edge);
        });
        get().pushHistory();
        get().syncCode();
      },

      removeEdge: (id) => {
        set((s) => {
          s.edges = s.edges.filter((e) => e.id !== id);
          if (s.selectedEdgeId === id) s.selectedEdgeId = "";
        });
        get().pushHistory();
        get().syncCode();
      },

      updateEdgeData: (id, patch) => {
        set((s) => {
          const edge = s.edges.find((e) => e.id === id);
          if (edge) {
            if (!edge.data) edge.data = {} as BpmnEdgeData;
            Object.assign(edge.data, patch);
            if (patch.label !== undefined) edge.label = patch.label;
          }
        });
        get().syncCode();
      },

      /* ---- Lane actions ---- */
      addLane: () => {
        set((s) => {
          const lastY = s.lanes.reduce((m, l) => Math.max(m, (l.y ?? 0) + (l.height ?? 128)), 12);
          s.lanes.push({
            id: uid("lane"),
            label: `Raia ${s.lanes.length + 1}`,
            y: lastY + 8,
            height: 128,
          });
        });
        get().pushHistory();
        get().syncCode();
      },

      removeLane: (id) => {
        set((s) => {
          s.lanes = s.lanes.filter((l) => l.id !== id);
          for (const n of s.nodes) {
            if (n.data.laneId === id) n.data.laneId = undefined;
          }
        });
        get().pushHistory();
        get().syncCode();
      },

      updateLane: (id, patch) => {
        set((s) => {
          const lane = s.lanes.find((l) => l.id === id);
          if (lane) Object.assign(lane, patch);
        });
        get().syncCode();
      },

      /* ---- Selection ---- */
      setSelectedNodeIds: (ids) => set({ selectedNodeIds: ids }),
      setSelectedEdgeId: (id) => set({ selectedEdgeId: id }),
      clearSelection: () => set({ selectedNodeIds: [], selectedEdgeId: "" }),

      /* ---- UI setters ---- */
      setBoardId: (id) => set({ boardId: id }),
      setPaletteCollapsed: (v) => set({ paletteCollapsed: v }),
      setPropertiesVisible: (v) => set({ propertiesVisible: v }),
      setShowEdges: (v) => set({ showEdges: v }),
      setLegendExpanded: (v) => set({ legendExpanded: v }),
      setPresentMode: (v) => set({ presentMode: v }),
      setCodeVisible: (v) => set({ codeVisible: v }),
      setCodeTab: (tab) => set({ codeTab: tab }),
      setSnapEnabled: (v) => set({ snapEnabled: v }),
      setBusy: (v) => set({ busy: v }),
      setSavingBoard: (v) => set({ savingBoard: v }),

      /* ---- History ---- */
      pushHistory: () => {
        set((s) => {
          const snapshot: HistorySnapshot = {
            nodes: structuredClone(s.nodes),
            edges: structuredClone(s.edges),
            lanes: structuredClone(s.lanes),
          };
          const trimmed = s.history.slice(0, s.historyIndex + 1);
          trimmed.push(snapshot);
          if (trimmed.length > HISTORY_LIMIT) trimmed.shift();
          s.history = trimmed;
          s.historyIndex = trimmed.length - 1;
        });
      },

      undo: () => {
        const { historyIndex, history } = get();
        if (historyIndex <= 0) return;
        const prev = history[historyIndex - 1];
        set({
          nodes: structuredClone(prev.nodes),
          edges: structuredClone(prev.edges),
          lanes: structuredClone(prev.lanes),
          historyIndex: historyIndex - 1,
        });
        get().syncCode();
      },

      redo: () => {
        const { historyIndex, history } = get();
        if (historyIndex >= history.length - 1) return;
        const next = history[historyIndex + 1];
        set({
          nodes: structuredClone(next.nodes),
          edges: structuredClone(next.edges),
          lanes: structuredClone(next.lanes),
          historyIndex: historyIndex + 1,
        });
        get().syncCode();
      },

      /* ---- Code sync ---- */
      syncCode: () => {
        const model = get().toBpmnModel();
        set({
          markdown: bpmnModelToMarkdown(model),
          xml: bpmnModelToXml(model),
        });
      },
      setMarkdown: (v) => set({ markdown: v }),
      setXml: (v) => set({ xml: v }),

      /* ---- Validation ---- */
      validate: () => {
        const model = get().toBpmnModel();
        const result = validateBpmnModel(model);
        set({ issues: result.issues });
      },

      /* ---- Model import/export ---- */
      toBpmnModel: (): BpmnTemplateModel => {
        const { nodes, edges, lanes, modelName } = get();
        return {
          version: "bpmn-2.0-lite",
          name: modelName,
          lanes: structuredClone(lanes),
          nodes: nodes.map(nodeToModelNode),
          edges: edges.map(edgeToModelEdge),
        };
      },

      loadFromModel: (model) => {
        const flowNodes = model.nodes.map(modelNodeToFlowNode);
        const flowEdges = model.edges.map(modelEdgeToFlowEdge);
        set({
          nodes: flowNodes,
          edges: flowEdges,
          lanes: structuredClone(model.lanes),
          modelName: model.name,
        });
        get().pushHistory();
        get().syncCode();
        get().validate();
      },

      setModelName: (name) => set({ modelName: name }),
    })),
    { name: "FluxBpmn", enabled: devEnabled },
  ),
);

/* Re-export helpers for external use */
export { modelNodeToFlowNode, modelEdgeToFlowEdge, laneForY, snap, uid };
