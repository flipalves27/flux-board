"use client";

import type { BpmnNodeType } from "@/lib/bpmn-types";

/** Cores e tamanhos do design system BPMN — eventos e gateways. */
const EV = {
  start: { bg: "#C8E6C9", border: "#43A047", fg: "#2E7D32", glyph: "▶" as const },
  end: { bg: "#FFCDD2", border: "#E53935", fg: "#C62828", glyph: "⬛" as const },
  msg: { bg: "#BBDEFB", border: "#1E88E5", fg: "#1565C0", glyph: "✉" as const },
  intermediate: { bg: "#FFF9C4", border: "#F9A825", fg: "#F57F17", glyph: "◎" as const },
  timer: { bg: "#E1F5FE", border: "#039BE5", fg: "#0277BD", glyph: "⏱" as const },
};

type EventPaletteStyle = (typeof EV)[keyof typeof EV];

function eventPalette(t: BpmnNodeType): EventPaletteStyle {
  if (t === "start_event") return EV.start;
  if (t === "end_event") return EV.end;
  if (t === "message_event") return EV.msg;
  if (t === "timer_event") return EV.timer;
  return EV.intermediate;
}

function gatewayGlyph(t: BpmnNodeType): string {
  if (t === "parallel_gateway") return "+";
  if (t === "inclusive_gateway") return "○";
  return "✕";
}

type EventGlyphProps = {
  nodeType: BpmnNodeType;
  size?: number;
  className?: string;
};

/** Círculo de evento (mesmo padrão visual do anexo). */
export function DeliveredEventGlyph({ nodeType, size = 42, className = "" }: EventGlyphProps) {
  const p = eventPalette(nodeType);
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full font-extrabold shadow-[0_3px_12px_rgba(26,39,68,0.1)] ${className}`}
      style={{
        width: size,
        height: size,
        background: p.bg,
        border: `4px solid ${p.border}`,
        color: p.fg,
        fontSize: size * 0.38,
      }}
      aria-hidden
    >
      {p.glyph}
    </div>
  );
}

type GatewayGlyphProps = {
  nodeType: BpmnNodeType;
  size?: number;
  className?: string;
};

/** Losango gateway âmbar com ícone central (anexo). */
export function DeliveredGatewayGlyph({ nodeType, size = 40, className = "" }: GatewayGlyphProps) {
  const g = gatewayGlyph(nodeType);
  return (
    <div className={`relative flex items-center justify-center ${className}`} style={{ width: size + 16, height: size + 16 }}>
      <div
        className="flex items-center justify-center shadow-[0_3px_12px_rgba(26,39,68,0.1)]"
        style={{
          width: size,
          height: size,
          background: "#FFE082",
          border: "3px solid #FFB300",
          borderRadius: 4,
          transform: "rotate(45deg)",
        }}
      >
        <span className="font-extrabold not-italic" style={{ transform: "rotate(-45deg)", color: "#1A2744", fontSize: size * 0.38 }}>
          {g}
        </span>
      </div>
    </div>
  );
}

/** Prévia na paleta: evento por tipo BPMN. */
export function DeliveredStencilEventIcon({ type }: { type: BpmnNodeType }) {
  return <DeliveredEventGlyph nodeType={type} size={36} />;
}

export function DeliveredStencilGatewayIcon({ type }: { type: BpmnNodeType }) {
  return <DeliveredGatewayGlyph nodeType={type} size={34} />;
}

/** @deprecated Use DeliveredEventGlyph */
export const RebornEventGlyph = DeliveredEventGlyph;
/** @deprecated Use DeliveredGatewayGlyph */
export const RebornGatewayGlyph = DeliveredGatewayGlyph;
/** @deprecated Use DeliveredStencilEventIcon */
export const RebornStencilEventIcon = DeliveredStencilEventIcon;
/** @deprecated Use DeliveredStencilGatewayIcon */
export const RebornStencilGatewayIcon = DeliveredStencilGatewayIcon;
