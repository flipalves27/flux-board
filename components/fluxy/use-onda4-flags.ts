"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/auth-context";
import { apiGet, ApiError } from "@/lib/api-client";
import type { Onda4UiFlags } from "@/lib/onda4-flags";

const defaultFlags: Onda4UiFlags = {
  enabled: false,
  omnibar: false,
  dailyBriefing: false,
  anomalyToasts: false,
};

export function useOnda4Flags(): Onda4UiFlags {
  const { user, isChecked, getHeaders } = useAuth();
  const [flags, setFlags] = useState<Onda4UiFlags>(defaultFlags);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!isChecked || !user?.orgId) {
        if (!cancelled) setFlags(defaultFlags);
        return;
      }
      try {
        const data = await apiGet<{ ui?: { onda4?: Partial<Onda4UiFlags> } }>("/api/org/features", getHeaders());
        const o = data?.ui?.onda4;
        if (!cancelled && o) {
          setFlags({
            enabled: Boolean(o.enabled),
            omnibar: Boolean(o.omnibar),
            dailyBriefing: Boolean(o.dailyBriefing),
            anomalyToasts: Boolean(o.anomalyToasts),
          });
        }
      } catch (e) {
        if (cancelled) return;
        if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
          setFlags(defaultFlags);
          return;
        }
        setFlags(defaultFlags);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [isChecked, user?.orgId, getHeaders]);

  return flags;
}
