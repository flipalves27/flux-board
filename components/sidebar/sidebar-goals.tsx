"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/context/auth-context";
import { apiGet, ApiError } from "@/lib/api-client";
import { IconGoals, IconChevronDown } from "./icons";
import { SidebarNavLink } from "./sidebar-nav-link";
import { SidebarSectionTitle } from "./sidebar-section-title";

type Objective = {
  id: string;
  title: string;
  quarter: string;
  owner?: string;
};

type GoalsData = {
  ok: boolean;
  quarter: string | null;
  objectives: Objective[];
};

export function SidebarGoals() {
  const t = useTranslations("navigation");
  const { user, isChecked, getHeaders } = useAuth();
  const [objectives, setObjectives] = useState<Objective[]>([]);
  const [expanded, setExpanded] = useState(true);
  const [loading, setLoading] = useState(false);

  const currentQuarter = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const q = Math.floor(now.getMonth() / 3) + 1;
    return `${year}-Q${q}`;
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadObjectives() {
      if (!isChecked || !user?.orgId) {
        setObjectives([]);
        return;
      }

      setLoading(true);
      try {
        const data = await apiGet<GoalsData>(
          `/api/okrs/objectives?quarter=${encodeURIComponent(currentQuarter)}`,
          getHeaders()
        );
        if (!cancelled) {
          const list = Array.isArray(data?.objectives) ? data.objectives : [];
          setObjectives(list);
        }
      } catch (e) {
        if (!cancelled) {
          if (!(e instanceof ApiError && (e.status === 401 || e.status === 403))) {
            setObjectives([]);
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadObjectives();
    return () => {
      cancelled = true;
    };
  }, [isChecked, user?.orgId, currentQuarter, getHeaders]);

  // Save expanded state to localStorage
  useEffect(() => {
    try {
      localStorage.setItem("sidebar-goals-expanded", String(expanded));
    } catch {
      /* ignore */
    }
  }, [expanded]);

  // Restore expanded state from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem("sidebar-goals-expanded");
      if (saved === "false") setExpanded(false);
    } catch {
      /* ignore */
    }
  }, []);

  const hasObjectives = objectives.length > 0;

  return (
    <div className="flex flex-col gap-1" data-flux-sidebar-zone="goals">
      {hasObjectives && (
        <>
          <SidebarSectionTitle>{t("section.goals") || "Goals"}</SidebarSectionTitle>

          {/* Main Goals Link */}
          <SidebarNavLink
            path="/okrs"
            hint={t("hints.goals") || "View all goals and key results"}
            icon={<IconGoals className="h-4 w-4 shrink-0" />}
            label={t("goals") || "Goals"}
            sublabel={currentQuarter}
          />

          {/* Collapsible Objectives List */}
          {expanded && (
            <div className="ml-2 flex flex-col gap-0.5 border-l border-[var(--flux-primary-alpha-20)] pl-2.5 py-1">
              {objectives.slice(0, 5).map((objective) => (
                <button
                  key={objective.id}
                  type="button"
                  onClick={() => {
                    // Navigate to OKRs page in the future can add objective parameter
                    window.location.href = `/okrs#objective-${objective.id}`;
                  }}
                  className="group flex items-start gap-2 rounded-[var(--flux-rad-sm)] px-2 py-1.5 text-left text-xs font-medium transition-colors duration-200 text-[var(--flux-text-muted)] hover:bg-[var(--flux-primary-alpha-05)] hover:text-[var(--flux-text)]"
                  title={objective.title}
                >
                  <span className="mt-0.5 flex-shrink-0 text-[6px] text-[var(--flux-primary-alpha-40)] group-hover:text-[var(--flux-primary-alpha-60)]">
                    ●
                  </span>
                  <span className="truncate">{objective.title}</span>
                </button>
              ))}
              {objectives.length > 5 && (
                <div className="px-2 py-1.5 text-[10px] text-[var(--flux-text-muted)] italic">
                  +{objectives.length - 5} mais
                </div>
              )}
            </div>
          )}

          {/* Toggle Button */}
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-2 rounded-[var(--flux-rad-sm)] px-2 py-1.5 text-left text-xs font-medium text-[var(--flux-text-muted)] transition-colors duration-200 hover:bg-[var(--flux-primary-alpha-05)] hover:text-[var(--flux-text)]"
            aria-expanded={expanded}
          >
            <IconChevronDown
              className={`h-3 w-3 shrink-0 transition-transform duration-200 ${
                expanded ? "rotate-0" : "-rotate-90"
              }`}
            />
            <span className="text-[10px]">{expanded ? "Recolher" : "Expandir"}</span>
          </button>
        </>
      )}
    </div>
  );
}
