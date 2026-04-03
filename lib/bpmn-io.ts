import type { BoardData } from "./kv-boards";
import type {
  BpmnEdgeKind,
  BpmnNodeType,
  BpmnPort,
  BpmnSemanticVariant,
  BpmnTemplateModel,
} from "./bpmn-types";

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

/** Split on `|` not escaped as `\|`. */
export function splitBpmnRowParts(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === "\\" && line[i + 1] === "|") {
      cur += "|";
      i++;
      continue;
    }
    if (c === "|") {
      out.push(cur.trim());
      cur = "";
      continue;
    }
    cur += c;
  }
  out.push(cur.trim());
  return out;
}

function escPipe(s: string): string {
  return s.replace(/\|/g, "\\|");
}

function parseKv(parts: string[], from: number): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = from; i < parts.length; i++) {
    const p = parts[i];
    const idx = p.indexOf(":");
    if (idx <= 0) continue;
    const k = p.slice(0, idx).trim();
    const v = p.slice(idx + 1).trim();
    if (k) out[k] = v;
  }
  return out;
}

function encodeWaypoints(wps: Array<{ x: number; y: number }> | undefined): string {
  if (!wps?.length) return "";
  return wps.map((w) => `${Math.round(w.x)},${Math.round(w.y)}`).join(";");
}

function decodeWaypoints(raw: string | undefined): Array<{ x: number; y: number }> | undefined {
  if (!raw?.trim()) return undefined;
  const pts: Array<{ x: number; y: number }> = [];
  for (const seg of raw.split(";")) {
    const [xs, ys] = seg.split(",").map((s) => s.trim());
    const x = Number(xs);
    const y = Number(ys);
    if (Number.isFinite(x) && Number.isFinite(y)) pts.push({ x, y });
  }
  return pts.length ? pts : undefined;
}

const SEMANTIC_VARIANTS: BpmnSemanticVariant[] = ["default", "delivered", "automation", "pain", "system"];
const EDGE_KINDS: BpmnEdgeKind[] = ["default", "primary", "rework", "cross_lane"];
const PORTS: BpmnPort[] = ["north", "east", "south", "west"];

function parseSemanticVariant(v: string | undefined): BpmnSemanticVariant | undefined {
  if (!v) return undefined;
  if (v === "reborn") return "delivered";
  return SEMANTIC_VARIANTS.includes(v as BpmnSemanticVariant) ? (v as BpmnSemanticVariant) : undefined;
}

function parseEdgeKind(v: string | undefined): BpmnEdgeKind | undefined {
  if (!v) return undefined;
  return EDGE_KINDS.includes(v as BpmnEdgeKind) ? (v as BpmnEdgeKind) : undefined;
}

function parsePort(v: string | undefined): BpmnPort | undefined {
  if (!v) return undefined;
  return PORTS.includes(v as BpmnPort) ? (v as BpmnPort) : undefined;
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
  const lanes = model.lanes
    .map((l) => {
      const extras: string[] = [];
      if (l.tag) extras.push(`tag:${escPipe(l.tag)}`);
      if (l.y != null) extras.push(`y:${l.y}`);
      if (l.height != null) extras.push(`h:${l.height}`);
      if (extras.length) return `- ${l.id} | ${escPipe(l.label)} | ${extras.join(" | ")}`;
      return `- ${l.id}: ${l.label}`;
    })
    .join("\n");

  const nodes = model.nodes
    .map((n) => {
      const base = `- ${n.id} | ${n.type} | ${escPipe(n.label)} | (${n.x},${n.y}) | lane:${n.laneId ?? "-"}`;
      const extras: string[] = [];
      if (n.width != null) extras.push(`w:${n.width}`);
      if (n.height != null) extras.push(`h:${n.height}`);
      if (n.subtitle) extras.push(`sub:${escPipe(n.subtitle)}`);
      if (n.stepNumber) extras.push(`step:${escPipe(n.stepNumber)}`);
      if (n.semanticVariant && n.semanticVariant !== "default") extras.push(`var:${n.semanticVariant}`);
      if (n.tooltip) extras.push(`tip:${escPipe(n.tooltip)}`);
      if (n.painBadge) extras.push(`pain:${escPipe(n.painBadge)}`);
      if (extras.length) return `${base} | ${extras.join(" | ")}`;
      return base;
    })
    .join("\n");

  const edges = model.edges
    .map((e) => {
      const base = `- ${e.id} | ${e.sourceId} -> ${e.targetId} | ${escPipe(e.label ?? "")}`;
      const extras: string[] = [];
      if (e.kind && e.kind !== "default") extras.push(`kind:${e.kind}`);
      if (e.sourcePort) extras.push(`sp:${e.sourcePort}`);
      if (e.targetPort) extras.push(`tp:${e.targetPort}`);
      const wps = encodeWaypoints(e.waypoints);
      if (wps) extras.push(`wps:${wps}`);
      if (extras.length) return `${base} | ${extras.join(" | ")}`;
      return base;
    })
    .join("\n");

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
      if (payload.includes("|")) {
        const parts = splitBpmnRowParts(payload);
        const id = parts[0];
        const label = parts[1];
        const kv = parseKv(parts, 2);
        if (id) {
          lanes.push({
            id,
            label: label || id,
            tag: kv.tag,
            y: kv.y != null ? Number(kv.y) : undefined,
            height: kv.h != null ? Number(kv.h) : undefined,
          });
        }
      } else {
        const idx = payload.indexOf(":");
        if (idx > 0) {
          const id = payload.slice(0, idx).trim();
          const label = payload.slice(idx + 1).trim();
          if (id) lanes.push({ id, label: label || id });
        }
      }
      continue;
    }

    if (section === "nodes") {
      const parts = splitBpmnRowParts(payload);
      if (parts.length < 5) continue;
      const [id, type, label, point, laneRaw] = parts;
      const m = /\(([-\d.]+),([-\d.]+)\)/.exec(point || "");
      const x = m ? Number(m[1]) : 120;
      const y = m ? Number(m[2]) : 120;
      const laneId = laneRaw?.startsWith("lane:") ? laneRaw.slice(5).trim() : "";
      const kv = parseKv(parts, 5);
      if (id && type) {
        nodes.push({
          id,
          type: type as BpmnNodeType,
          label: label || id,
          x: Number.isFinite(x) ? x : 120,
          y: Number.isFinite(y) ? y : 120,
          laneId: laneId && laneId !== "-" ? laneId : undefined,
          width: kv.w != null ? Number(kv.w) : undefined,
          height: kv.h != null ? Number(kv.h) : undefined,
          subtitle: kv.sub,
          stepNumber: kv.step,
          semanticVariant: parseSemanticVariant(kv.var),
          tooltip: kv.tip,
          painBadge: kv.pain,
        });
      }
      continue;
    }

    if (section === "edges") {
      const parts = splitBpmnRowParts(payload);
      if (parts.length < 3) continue;
      const [id, flow, label] = parts;
      const [sourceId, targetId] = (flow || "").split("->").map((s) => s.trim());
      const kv = parseKv(parts, 3);
      if (id && sourceId && targetId) {
        edges.push({
          id,
          sourceId,
          targetId,
          label: label || undefined,
          kind: parseEdgeKind(kv.kind),
          sourcePort: parsePort(kv.sp),
          targetPort: parsePort(kv.tp),
          waypoints: decodeWaypoints(kv.wps),
        });
      }
    }
  }
  return { version: "bpmn-2.0-lite", name, lanes, nodes, edges };
}

export function bpmnModelToXml(model: BpmnTemplateModel): string {
  const lanes = model.lanes
    .map((l) => {
      const y = l.y != null ? ` y="${l.y}"` : "";
      const h = l.height != null ? ` height="${l.height}"` : "";
      const tag = l.tag ? ` tag="${esc(l.tag)}"` : "";
      return `<lane id="${esc(l.id)}" label="${esc(l.label)}"${y}${h}${tag} />`;
    })
    .join("");
  const nodes = model.nodes
    .map((n) => {
      const w = n.width != null ? ` width="${n.width}"` : "";
      const h = n.height != null ? ` height="${n.height}"` : "";
      const sub = n.subtitle ? ` subtitle="${esc(n.subtitle)}"` : "";
      const step = n.stepNumber ? ` stepNumber="${esc(n.stepNumber)}"` : "";
      const vari = n.semanticVariant ? ` semanticVariant="${esc(n.semanticVariant)}"` : "";
      const tip = n.tooltip ? ` tooltip="${esc(n.tooltip)}"` : "";
      const pain = n.painBadge ? ` painBadge="${esc(n.painBadge)}"` : "";
      return `<node id="${esc(n.id)}" type="${esc(n.type)}" label="${esc(n.label)}" x="${n.x}" y="${n.y}" laneId="${esc(
        n.laneId ?? ""
      )}"${w}${h}${sub}${step}${vari}${tip}${pain} />`;
    })
    .join("");
  const edges = model.edges
    .map((e) => {
      const kind = e.kind && e.kind !== "default" ? ` kind="${esc(e.kind)}"` : "";
      const sp = e.sourcePort ? ` sourcePort="${e.sourcePort}"` : "";
      const tp = e.targetPort ? ` targetPort="${e.targetPort}"` : "";
      const wps = e.waypoints?.length ? ` waypoints="${esc(encodeWaypoints(e.waypoints))}"` : "";
      return `<edge id="${esc(e.id)}" sourceId="${esc(e.sourceId)}" targetId="${esc(e.targetId)}" label="${esc(
        e.label ?? ""
      )}"${kind}${sp}${tp}${wps} />`;
    })
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
    if (a.id) {
      lanes.push({
        id: a.id,
        label: a.label || a.id,
        y: a.y != null ? Number(a.y) : undefined,
        height: a.height != null ? Number(a.height) : undefined,
        tag: a.tag || undefined,
      });
    }
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
      width: a.width != null ? Number(a.width) : undefined,
      height: a.height != null ? Number(a.height) : undefined,
      subtitle: a.subtitle || undefined,
      stepNumber: a.stepNumber || undefined,
      semanticVariant: parseSemanticVariant(a.semanticVariant),
      tooltip: a.tooltip || undefined,
      painBadge: a.painBadge || undefined,
    });
  }
  for (const m of xml.matchAll(/<edge([^>]*)\/>/gi)) {
    const a = attrs(m[1]);
    if (!a.id || !a.sourceId || !a.targetId) continue;
    edges.push({
      id: a.id,
      sourceId: a.sourceId,
      targetId: a.targetId,
      label: a.label || undefined,
      kind: parseEdgeKind(a.kind),
      sourcePort: parsePort(a.sourcePort),
      targetPort: parsePort(a.targetPort),
      waypoints: decodeWaypoints(a.waypoints),
    });
  }
  return {
    version: (rootAttrs.version as "bpmn-2.0-lite") || "bpmn-2.0-lite",
    name: rootAttrs.name || "BPMN Template",
    lanes,
    nodes,
    edges,
  };
}
