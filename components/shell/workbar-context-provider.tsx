"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

type SlotContent = Record<string, ReactNode>;

type WorkbarContextValue = {
  slots: SlotContent;
  setSlot: (id: string, node: ReactNode | null) => void;
};

export const WorkbarContext = createContext<WorkbarContextValue | null>(null);

export function WorkbarProvider({ children }: { children: ReactNode }) {
  const [slots, setSlots] = useState<SlotContent>({});

  const setSlot = useCallback((id: string, node: ReactNode | null) => {
    setSlots((prev) => {
      const next = { ...prev };
      if (node == null) delete next[id];
      else next[id] = node;
      return next;
    });
  }, []);

  const value = useMemo(() => ({ slots, setSlot }), [slots, setSlot]);

  return <WorkbarContext.Provider value={value}>{children}</WorkbarContext.Provider>;
}

export function useWorkbarContext(): WorkbarContextValue {
  const ctx = useContext(WorkbarContext);
  if (!ctx) throw new Error("useWorkbarContext must be used within WorkbarProvider");
  return ctx;
}
