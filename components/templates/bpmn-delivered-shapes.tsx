"use client";

import type { BpmnNodeType } from "@/lib/bpmn-types";

/** Cores e tamanhos do design system BPMN — eventos e gateways. */
const EV = {
  start: {
    bg: "var(--flux-bpmn-event-start-bg)",
    border: "var(--flux-bpmn-event-start-border)",
    fg: "var(--flux-bpmn-event-start-fg)",
    glyph: "▶" as const,
  },
  end: {
    bg: "var(--flux-bpmn-delivered-end-bg)",
    border: "var(--flux-bpmn-delivered-end-border)",
    fg: "var(--flux-bpmn-delivered-end-fg)",
    glyph: "⬛" as const,
  },
  msg: {
    bg: "var(--flux-bpmn-event-message-bg)",
    border: "var(--flux-bpmn-event-message-border)",
    fg: "var(--flux-bpmn-event-message-fg)",
    glyph: "✉" as const,
  },
  intermediate: {
    bg: "var(--flux-bpmn-event-intermediate-bg)",
    border: "var(--flux-bpmn-event-intermediate-border)",
    fg: "var(--flux-bpmn-event-intermediate-fg)",
    glyph: "◎" as const,
  },
  timer: {
    bg: "var(--flux-bpmn-event-timer-bg)",
    border: "var(--flux-bpmn-event-timer-border)",
    fg: "var(--flux-bpmn-event-timer-fg)",
    glyph: "⏱" as const,
  },
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
      className={`flex shrink-0 items-center justify-center rounded-full font-extrabold shadow-[0_3px_12px_var(--flux-bpmn-task-shadow-soft)] ${className}`}
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
        className="flex items-center justify-center shadow-[0_3px_12px_var(--flux-bpmn-task-shadow-soft)]"
        style={{
          width: size,
          height: size,
          background: "var(--flux-bpmn-gateway-bg)",
          border: "3px solid var(--flux-bpmn-semantic-gateway)",
          borderRadius: 4,
          transform: "rotate(45deg)",
        }}
      >
        <span
          className="font-extrabold not-italic"
          style={{ transform: "rotate(-45deg)", color: "var(--flux-bpmn-surface-label)", fontSize: size * 0.38 }}
        >
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
