"use client";

import { useContext, useEffect, useId } from "react";
import type { ReactNode } from "react";
import { WorkbarContext } from "./workbar-context-provider";

/** Registers `children` into the sticky workbar slot while mounted (no-op without `WorkbarProvider`). */
export function useWorkbarSlot(children: ReactNode | null) {
  const id = useId();
  const ctx = useContext(WorkbarContext);

  useEffect(() => {
    if (!ctx) return;
    ctx.setSlot(id, children);
    return () => ctx.setSlot(id, null);
  }, [children, ctx, id]);
}
