import type { BoardData } from "./kv-boards";
import type { BpmnTemplateModel, BpmnNodeType } from "./bpmn-types";

const BOARD_BPMN_MARKER = "bpmn_model_v1";

function esc(input: string): string {
  return input.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function unesc(input: string): string {
  return input
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");
}

export function bpmnModelFromBoard(board: BoardData): BpmnTemplateModel | null {
  const raw = Array.isArray(board.mapaProducao) ? board.mapaProducao : [];
  const marker = raw.find((item) => item && typeof item === "object" && (item as { _type?: string })._type === BOARD_BPMN_MARKER) as
    | { model?: BpmnTemplateModel }
    | undefined;
  return marker?.model ?? null;
}

export function attachBpmnModelToMapa(model: BpmnTemplateModel, current: unknown[] | undefined): unknown[] {
  const base = Array.isArray(current) ? current : [];
  const next = base.filter((item) => !(item && typeof item === "object" && (item as { _type?: string })._type === BOARD_BPMN_MARKER));
  next.push({ _type: BOARD_BPMN_MARKER, model });
  return next;
}

export function bpmnModelToMarkdown(model: BpmnTemplateModel): string {
  const lanes = model.lanes.map((l) => `- ${l.id}: ${l.label}`).join("\n");
  const nodes = model.nodes
    .map((n) => `- ${n.id} | ${n.type} | ${n.label} | (${n.x},${n.y}) | lane:${n.laneId ?? "-"}`)
    .join("\n");
  const edges = model.edges.map((e) => `- ${e.id} | ${e.sourceId} -> ${e.targetId} | ${e.label ?? ""}`).join("\n");
  return [
    `# BPMN Template`,
    `name: ${model.name}`,
    `version: ${model.version}`,
    ``,
    `## Lanes`,
    lanes || "- default: Main",
    ``,
    `## Nodes`,
    nodes,
    ``,
    `## Edges`,
    edges,
    ``,
  ].join("\n");
}

export function markdownToBpmnModel(content: string): BpmnTemplateModel {
  const lines = content.split(/\r?\n/);
  let name = "BPMN Template";
  const lanes: BpmnTemplateModel["lanes"] = [];
  const nodes: BpmnTemplateModel["nodes"] = [];
  const edges: BpmnTemplateModel["edges"] = [];
  let section: "" | "lanes" | "nodes" | "edges" = "";

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.toLowerCase().startsWith("name:")) {
      name = line.slice(5).trim() || name;
      continue;
    }
    if (line === "## Lanes") {
      section = "lanes";
      continue;
    }
    if (line === "## Nodes") {
      section = "nodes";
      continue;
    }
    if (line === "## Edges") {
      section = "edges";
      continue;
    }
    if (!line.startsWith("- ")) continue;
    const payload = line.slice(2).trim();
    if (section === "lanes") {
      const [id, label] = payload.split(":").map((s) => s.trim());
      if (id) lanes.push({ id, label: label || id });
      continue;
    }
    if (section === "nodes") {
      const [id, type, label, point, laneRaw] = payload.split("|").map((s) => s.trim());
      const m = /\(([-\d.]+),([-\d.]+)\)/.exec(point || "");
      const x = m ? Number(m[1]) : 120;
      const y = m ? Number(m[2]) : 120;
      const laneId = laneRaw?.startsWith("lane:") ? laneRaw.slice(5).trim() : "";
      if (id && type) {
        nodes.push({
          id,
          type: type as BpmnNodeType,
          label: label || id,
          x: Number.isFinite(x) ? x : 120,
          y: Number.isFinite(y) ? y : 120,
          laneId: laneId && laneId !== "-" ? laneId : undefined,
        });
      }
      continue;
    }
    if (section === "edges") {
      const [id, flow, label] = payload.split("|").map((s) => s.trim());
      const [sourceId, targetId] = (flow || "").split("->").map((s) => s.trim());
      if (id && sourceId && targetId) edges.push({ id, sourceId, targetId, label: label || undefined });
    }
  }
  return { version: "bpmn-2.0-lite", name, lanes, nodes, edges };
}

export function bpmnModelToXml(model: BpmnTemplateModel): string {
  const lanes = model.lanes.map((l) => `<lane id="${esc(l.id)}" label="${esc(l.label)}" />`).join("");
  const nodes = model.nodes
    .map(
      (n) =>
        `<node id="${esc(n.id)}" type="${esc(n.type)}" label="${esc(n.label)}" x="${n.x}" y="${n.y}" laneId="${esc(n.laneId ?? "")}" />`
    )
    .join("");
  const edges = model.edges
    .map(
      (e) =>
        `<edge id="${esc(e.id)}" sourceId="${esc(e.sourceId)}" targetId="${esc(e.targetId)}" label="${esc(e.label ?? "")}" />`
    )
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?><bpmnTemplate version="${model.version}" name="${esc(model.name)}"><lanes>${lanes}</lanes><nodes>${nodes}</nodes><edges>${edges}</edges></bpmnTemplate>`;
}

function attrs(xml: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of xml.matchAll(/([a-zA-Z0-9_:-]+)="([^"]*)"/g)) out[m[1]] = unesc(m[2]);
  return out;
}

export function xmlToBpmnModel(xml: string): BpmnTemplateModel {
  const rootMatch = /<bpmnTemplate([^>]*)>/i.exec(xml);
  const rootAttrs = attrs(rootMatch?.[1] ?? "");
  const lanes: BpmnTemplateModel["lanes"] = [];
  const nodes: BpmnTemplateModel["nodes"] = [];
  const edges: BpmnTemplateModel["edges"] = [];
  for (const m of xml.matchAll(/<lane([^>]*)\/>/gi)) {
    const a = attrs(m[1]);
    if (a.id) lanes.push({ id: a.id, label: a.label || a.id });
  }
  for (const m of xml.matchAll(/<node([^>]*)\/>/gi)) {
    const a = attrs(m[1]);
    if (!a.id || !a.type) continue;
    nodes.push({
      id: a.id,
      type: a.type as BpmnNodeType,
      label: a.label || a.id,
      x: Number(a.x ?? 120),
      y: Number(a.y ?? 120),
      laneId: a.laneId || undefined,
    });
  }
  for (const m of xml.matchAll(/<edge([^>]*)\/>/gi)) {
    const a = attrs(m[1]);
    if (!a.id || !a.sourceId || !a.targetId) continue;
    edges.push({ id: a.id, sourceId: a.sourceId, targetId: a.targetId, label: a.label || undefined });
  }
  return {
    version: (rootAttrs.version as "bpmn-2.0-lite") || "bpmn-2.0-lite",
    name: rootAttrs.name || "BPMN Template",
    lanes,
    nodes,
    edges,
  };
}

