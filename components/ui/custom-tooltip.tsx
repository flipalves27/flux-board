"use client";

import { cloneElement, isValidElement, useCallback, useEffect, useRef, useState, type ReactElement } from "react";
import { createPortal } from "react-dom";

type TooltipPosition = "top" | "bottom" | "left" | "right";

interface CustomTooltipProps {
  content: string;
  children: ReactElement;
  position?: TooltipPosition;
  offset?: number;
  className?: string;
  disabled?: boolean;
}

interface Coords {
  top: number;
  left: number;
}

function getTooltipCoords(trigger: DOMRect, tooltip: DOMRect, position: TooltipPosition, offset: number): Coords {
  if (position === "bottom") {
    return {
      top: trigger.bottom + offset,
      left: trigger.left + trigger.width / 2 - tooltip.width / 2,
    };
  }
  if (position === "left") {
    return {
      top: trigger.top + trigger.height / 2 - tooltip.height / 2,
      left: trigger.left - tooltip.width - offset,
    };
  }
  if (position === "right") {
    return {
      top: trigger.top + trigger.height / 2 - tooltip.height / 2,
      left: trigger.right + offset,
    };
  }
  return {
    top: trigger.top - tooltip.height - offset,
    left: trigger.left + trigger.width / 2 - tooltip.width / 2,
  };
}

function clampToViewport(coords: Coords, tooltip: DOMRect, padding = 8): Coords {
  const maxLeft = window.innerWidth - tooltip.width - padding;
  const maxTop = window.innerHeight - tooltip.height - padding;

  return {
    left: Math.min(Math.max(coords.left, padding), Math.max(maxLeft, padding)),
    top: Math.min(Math.max(coords.top, padding), Math.max(maxTop, padding)),
  };
}

export function CustomTooltip({
  content,
  children,
  position = "top",
  offset = 10,
  className = "",
  disabled = false,
}: CustomTooltipProps) {
  const triggerRef = useRef<HTMLElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [coords, setCoords] = useState<Coords>({ top: -9999, left: -9999 });

  useEffect(() => {
    setMounted(true);
  }, []);

  const updatePosition = useCallback(() => {
    if (!open || !triggerRef.current || !tooltipRef.current) return;
    const next = getTooltipCoords(
      triggerRef.current.getBoundingClientRect(),
      tooltipRef.current.getBoundingClientRect(),
      position,
      offset
    );
    setCoords(clampToViewport(next, tooltipRef.current.getBoundingClientRect()));
  }, [open, offset, position]);

  useEffect(() => {
    updatePosition();
  }, [updatePosition]);

  useEffect(() => {
    if (!open) return;
    const handle = () => updatePosition();
    window.addEventListener("scroll", handle, true);
    window.addEventListener("resize", handle);
    return () => {
      window.removeEventListener("scroll", handle, true);
      window.removeEventListener("resize", handle);
    };
  }, [open, updatePosition]);

  if (!isValidElement(children)) return children;

  const childProps = children.props as {
    onMouseEnter?: (e: React.MouseEvent<HTMLElement>) => void;
    onMouseLeave?: (e: React.MouseEvent<HTMLElement>) => void;
    onFocus?: (e: React.FocusEvent<HTMLElement>) => void;
    onBlur?: (e: React.FocusEvent<HTMLElement>) => void;
  };

  const wrapped = cloneElement(children, {
    ref: (node: HTMLElement | null) => {
      triggerRef.current = node;
      const childRef = (children as ReactElement & { ref?: unknown }).ref;
      if (typeof childRef === "function") childRef(node);
      else if (childRef && typeof childRef === "object" && "current" in childRef) {
        (childRef as { current: HTMLElement | null }).current = node;
      }
    },
    onMouseEnter: (e: React.MouseEvent<HTMLElement>) => {
      childProps.onMouseEnter?.(e);
      if (!disabled) setOpen(true);
    },
    onMouseLeave: (e: React.MouseEvent<HTMLElement>) => {
      childProps.onMouseLeave?.(e);
      setOpen(false);
    },
    onFocus: (e: React.FocusEvent<HTMLElement>) => {
      childProps.onFocus?.(e);
      if (!disabled) setOpen(true);
    },
    onBlur: (e: React.FocusEvent<HTMLElement>) => {
      childProps.onBlur?.(e);
      setOpen(false);
    },
  });

  return (
    <>
      {wrapped}
      {mounted && open && !disabled && content
        ? createPortal(
            <div
              ref={tooltipRef}
              role="tooltip"
              className={`pointer-events-none fixed z-[9999] max-w-[260px] rounded-lg border border-[rgba(108,92,231,0.35)] bg-[rgba(20,16,44,0.95)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--flux-text)] shadow-[0_10px_30px_rgba(0,0,0,0.45)] backdrop-blur-sm ${className}`}
              style={{ top: coords.top, left: coords.left }}
            >
              {content}
            </div>,
            document.body
          )
        : null}
    </>
  );
}
