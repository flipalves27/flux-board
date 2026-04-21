"use client";

import { memo, useEffect, useState } from "react";

type Props = {
  text: string;
  x: number;
  y: number;
  visible: boolean;
};

function BpmnTooltipInner({ text, x, y, visible }: Props) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!visible) {
      setShow(false);
      return;
    }
    const timer = window.setTimeout(() => setShow(true), 120);
    return () => clearTimeout(timer);
  }, [visible]);

  if (!show || !text) return null;

  const adjustedX = typeof window !== "undefined" && x + 290 > window.innerWidth ? x - 290 : x + 14;
  const adjustedY = typeof window !== "undefined" && y + 80 > window.innerHeight ? y - 80 : y + 14;

  return (
    <div
      className="pointer-events-none fixed z-[2000]"
      style={{
        left: adjustedX,
        top: adjustedY,
        opacity: show ? 1 : 0,
        transition: "opacity 120ms ease",
      }}
    >
      <div
        className="rounded-[9px] px-3.5 py-2.5 text-[11px] font-medium leading-relaxed text-white"
        style={{
          background: "var(--flux-bpmn-surface-tooltip)",
          boxShadow: "var(--flux-bpmn-tooltip-shadow)",
          maxWidth: 280,
        }}
      >
        {text}
      </div>
    </div>
  );
}

export const BpmnTooltip = memo(BpmnTooltipInner);
