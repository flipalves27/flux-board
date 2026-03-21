"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useAuth } from "@/context/auth-context";
import { Header } from "@/components/header";
import { KanbanBoard } from "@/components/kanban";
import { BoardCopilotPanel } from "@/components/kanban/board-copilot-panel";
import { BoardAutomationsModal } from "@/components/kanban/board-automations-modal";
import { BoardPortalModal, type PortalClientState } from "@/components/kanban/board-portal-modal";
import { BoardTemplateExportModal } from "@/components/board/board-template-export-modal";
import { BoardEmbedModal } from "@/components/board/board-embed-modal";
import { BoardAnomalyNotificationsModal } from "@/components/kanban/board-anomaly-notifications-modal";
import type { BoardAnomalyNotifications } from "@/lib/anomaly-board-settings";
import { apiFetch, getApiHeaders } from "@/lib/api-client";
import { useToast } from "@/context/toast-context";
import { registerBoardVisit } from "@/lib/board-shortcuts";
import { setBoardPersistenceHandler, useBoardStore } from "@/stores/board-store";
import { useKanbanUiStore } from "@/stores/ui-store";
import { useCopilotStore } from "@/stores/copilot-store";
import { useBoardNlqUiStore } from "@/stores/board-nlq-ui-store";
import { useMinimumSkeletonDuration } from "@/lib/use-minimum-skeleton-duration";
import { DataFadeIn } from "@/components/ui/data-fade-in";
import { SkeletonKanbanBoard } from "@/components/skeletons/flux-skeletons";
import { BoardRouteLoadingFallback } from "@/components/skeletons/route-loading-fallbacks";

const FILTER_LABELS = [
  "Comercial",
  "Corretor",
  "Financial Lines (D&O)",
  "Incidente",
  "Negócio",
  "Portal do Corretor",
  "RCG",
  "Reborn",
  "Ressegurador",
  "Segurado",
  "Subscrição",
  "Tomador",
];

const PRIORITIES = ["Urgente", "Importante", "Média"];
const PROGRESSES = ["Não iniciado", "Em andamento", "Concluída"];
const DIRECTIONS = ["Manter", "Priorizar", "Adiar", "Cancelar", "Reavaliar"];

export interface CardLink {
  url: string;
  label?: string;
}

export interface CardDocRef {
  docId: string;
  title?: string;
  excerpt?: string;
}

export interface DailyInsightPayload {
  resumo?: string;
  contextoOrganizado?: string;
  criar?: string[];
  criarDetalhes?: Array<DailyInsightActionPayload>;
  ajustar?: Array<string | DailyInsightActionPayload>;
  corrigir?: Array<string | DailyInsightActionPayload>;
  pendencias?: Array<string | DailyInsightActionPayload>;
}

export interface DailyInsightActionPayload {
  titulo?: string;
  descricao?: string;
  prioridade?: string;
  progresso?: string;
  coluna?: string;
  tags?: string[];
  dataConclusao?: string;
  direcionamento?: string;
}

export interface DailyCreatedCard {
  cardId: string;
  title: string;
  bucket: string;
  priority: string;
  progress: string;
  desc?: string;
  tags?: string[];
  direction?: string | null;
  dueDate?: string | null;
  createdAt?: string;
  status?: "created" | "existing";
}

export interface DailyInsightEntry {
  id: string;
  createdAt?: string;
  transcript?: string;
  sourceFileName?: string;
  insight?: DailyInsightPayload;
  createdCards?: DailyCreatedCard[];
  generationMeta?: {
    usedLlm?: boolean;
    model?: string;
  };
}

export interface CardData {
  id: string;
  bucket: string;
  priority: string;
  progress: string;
  title: string;
  desc: string;
  tags: string[];
  links?: CardLink[];
  docRefs?: CardDocRef[];
  direction: string | null;
  dueDate: string | null;
  /** Cards que precisam concluir antes deste (IDs). */
  blockedBy?: string[];
  order: number;
  columnEnteredAt?: string;
  automationState?: { lastFired?: Record<string, string> };
}

export interface BucketConfig {
  key: string;
  label: string;
  color: string;
}

export interface BoardData {
  version: string;
  lastUpdated: string;
  cards: CardData[];
  config: {
    bucketOrder: BucketConfig[];
    collapsedColumns: string[];
    labels?: string[];
  };
  mapaProducao?: { papel: string; equipe: string; linha: string; operacoes: string }[];
  dailyInsights?: DailyInsightEntry[];
  intakeForm?: {
    enabled?: boolean;
    slug?: string;
    title?: string;
    description?: string;
    targetBucketKey?: string;
    defaultPriority?: string;
    defaultProgress?: string;
    defaultTags?: string[];
  };
  portal?: PortalClientState;
  anomalyNotifications?: BoardAnomalyNotifications;
}

const DEFAULT_BUCKETS: BucketConfig[] = [
  { key: "Refinamento Negócio/Técnico", label: "Refinamento", color: "var(--flux-text-muted)" },
  { key: "Backlog", label: "Backlog", color: "var(--flux-primary)" },
  { key: "Priorizado", label: "Priorizado", color: "var(--flux-secondary)" },
  { key: "Em Execução (Desenvolvimento)", label: "Em Execução", color: "var(--flux-accent)" },
  { key: "Incidente", label: "Incidente", color: "var(--flux-warning)" },
  { key: "Em Produção", label: "Em Produção", color: "var(--flux-success)" },
];

export default function BoardPage() {
  const router = useRouter();
  const params = useParams();
  const boardId = params.id as string;
  const { user, getHeaders, isChecked } = useAuth();
  const { pushToast } = useToast();
  const locale = useLocale();
  const t = useTranslations("board");
  const localeRoot = `/${locale}`;
  const [boardName, setBoardName] = useState("Board");
  const db = useBoardStore((s) => s.db);
  const [loading, setLoading] = useState(true);
  const [automationsOpen, setAutomationsOpen] = useState(false);
  const [portalOpen, setPortalOpen] = useState(false);
  const [templateExportOpen, setTemplateExportOpen] = useState(false);
  const [embedOpen, setEmbedOpen] = useState(false);
  const [anomalySettingsOpen, setAnomalySettingsOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const saveRequestSeqRef = useRef(0);

  const authWaiting = !isChecked || !user;
  const showBoardSkeleton = useMinimumSkeletonDuration(!authWaiting && loading);

  useEffect(() => {
    if (!isChecked || !user) {
      router.replace(`${localeRoot}/login`);
      return;
    }
    if (!boardId) {
      router.replace(`${localeRoot}/boards`);
      return;
    }
    useKanbanUiStore.getState().resetForBoardSwitch();
    useCopilotStore.getState().resetSessionUi();
    loadBoard();
  }, [isChecked, user, boardId, router, localeRoot]);

  useEffect(() => {
    const id = boardId;
    return () => {
      useBoardNlqUiStore.getState().clearBoardNlq(id);
    };
  }, [boardId]);

  async function loadBoard() {
    try {
      const r = await apiFetch(`/api/boards/${boardId}`, {
        cache: "no-store",
        headers: getHeaders(),
      });
      if (r.status === 401) {
        router.replace(`${localeRoot}/login`);
        return;
      }
      if (r.status === 403) {
        pushToast({ kind: "error", title: t("toasts.noPermission") });
        router.replace(`${localeRoot}/boards`);
        return;
      }
      if (!r.ok) throw new Error("Erro ao carregar");
      const d = await r.json();
      setBoardName(d.name || "Board");
      const cards = (d.cards || []).map((c: CardData, i: number) => ({
        ...c,
        order: c.order ?? i,
        dueDate: c.dueDate ?? null,
        blockedBy: Array.isArray(c.blockedBy)
          ? [...new Set(c.blockedBy.filter((id) => typeof id === "string" && id.trim()))]
          : [],
        direction: c.direction ?? null,
        tags: Array.isArray(c.tags) ? c.tags : [],
        links: Array.isArray(c.links) ? c.links.filter((l) => l && typeof l.url === "string" && l.url.trim()) : [],
        docRefs: Array.isArray(c.docRefs)
          ? c.docRefs
              .filter((d) => d && typeof d.docId === "string" && d.docId.trim())
              .map((d) => ({ docId: String(d.docId), title: d.title ? String(d.title) : undefined, excerpt: d.excerpt ? String(d.excerpt) : undefined }))
          : [],
      }));
      useBoardStore.getState().hydrate(boardId, {
        version: d.version || "2.0",
        lastUpdated: d.lastUpdated || "",
        cards,
        config: {
          bucketOrder: d.config?.bucketOrder || DEFAULT_BUCKETS,
          collapsedColumns: d.config?.collapsedColumns || [],
          labels:
            Array.isArray(d.config?.labels) && d.config.labels.length > 0
              ? d.config.labels.filter((l: unknown) => typeof l === "string" && l.trim())
              : FILTER_LABELS,
        },
        mapaProducao: d.mapaProducao,
        dailyInsights: Array.isArray(d.dailyInsights) ? d.dailyInsights : [],
        intakeForm: d.intakeForm,
        portal: d.portal,
      });
      if (user?.id) {
        registerBoardVisit(user.id, boardId);
      }
    } catch {
      pushToast({ kind: "error", title: t("toasts.loadError") });
      router.replace(`${localeRoot}/boards`);
    } finally {
      setLoading(false);
    }
  }

  const persist = useCallback(
    (data?: BoardData) => {
      const toSave = data ?? useBoardStore.getState().db;
      if (!toSave) return;
      const payload = {
        ...toSave,
        lastUpdated: new Date().toISOString(),
      };
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      setSaveStatus("saving");
      saveTimeoutRef.current = setTimeout(async () => {
        const requestSeq = ++saveRequestSeqRef.current;
        saveTimeoutRef.current = null;
        const maxAttempts = 3;
        const backoffBaseMs = 400;
        try {
          for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
              const res = await apiFetch(`/api/boards/${boardId}`, {
                method: "PUT",
                body: JSON.stringify(payload),
                headers: getApiHeaders(getHeaders()),
              });
              const data = (await res.json()) as {
                error?: string;
                lastUpdated?: string;
                cards?: CardData[];
              };
              if (!res.ok) throw new Error(data.error || "save");
              if (Array.isArray(data.cards)) {
                const cards = data.cards!.map((c: CardData, i: number) => ({
                  ...c,
                  order: c.order ?? i,
                  dueDate: c.dueDate ?? null,
                  blockedBy: Array.isArray(c.blockedBy)
                    ? [...new Set(c.blockedBy.filter((id) => typeof id === "string" && id.trim()))]
                    : [],
                  direction: c.direction ?? null,
                  tags: Array.isArray(c.tags) ? c.tags : [],
                  links: Array.isArray(c.links)
                    ? c.links.filter((l) => l && typeof l.url === "string" && l.url.trim())
                    : [],
                  docRefs: Array.isArray(c.docRefs)
                    ? c.docRefs
                        .filter((d) => d && typeof d.docId === "string" && d.docId.trim())
                        .map((d) => ({
                          docId: String(d.docId),
                          title: d.title ? String(d.title) : undefined,
                          excerpt: d.excerpt ? String(d.excerpt) : undefined,
                        }))
                    : [],
                }));
                useBoardStore.getState().updateDbSilent((d) => {
                  d.cards = cards;
                  if (data.lastUpdated) d.lastUpdated = data.lastUpdated;
                });
              }
              if (saveRequestSeqRef.current !== requestSeq) return;
              setSaveStatus("saved");
              setTimeout(() => {
                if (saveRequestSeqRef.current === requestSeq) setSaveStatus("idle");
              }, 1500);
              return;
            } catch {
              if (attempt >= maxAttempts) break;
              const waitMs = backoffBaseMs * Math.pow(2, attempt - 1);
              await new Promise((r) => window.setTimeout(r, waitMs));
            }
          }
          if (saveRequestSeqRef.current !== requestSeq) return;
          setSaveStatus("error");
          pushToast({ kind: "error", title: t("toasts.saveError") });
          setTimeout(() => {
            if (saveRequestSeqRef.current === requestSeq) setSaveStatus("idle");
          }, 3000);
        } finally {
          saveTimeoutRef.current = null;
        }
      }, 300);
    },
    [boardId, getHeaders, t]
  );

  useEffect(() => {
    setBoardPersistenceHandler(() => persist());
    return () => setBoardPersistenceHandler(null);
  }, [persist]);

  if (authWaiting) {
    return <BoardRouteLoadingFallback />;
  }
  if (showBoardSkeleton || !db) {
    return (
      <div className="min-h-screen bg-[var(--flux-surface-dark)]">
        <Header title={boardName}>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <div className="h-8 w-24 rounded-[var(--flux-rad)] bg-[var(--flux-chrome-alpha-12)] flux-animate-skeleton-pulse" />
            <div className="h-8 w-24 rounded-[var(--flux-rad)] bg-[var(--flux-chrome-alpha-12)] flux-animate-skeleton-pulse" />
          </div>
        </Header>
        <SkeletonKanbanBoard />
      </div>
    );
  }
  const formSlug = String(db.intakeForm?.slug || "").trim();
  const formLink =
    formSlug && typeof window !== "undefined"
      ? `${window.location.origin}/${locale}/forms/${encodeURIComponent(formSlug)}`
      : "";

  return (
    <div className="min-h-screen bg-[var(--flux-surface-dark)]">
      <DataFadeIn active key={boardId}>
        <div>
          <Header title={boardName}>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setAutomationsOpen(true)}>
                {t("automations.open")}
              </button>
              <button type="button" className="btn-secondary" onClick={() => setAnomalySettingsOpen(true)}>
                {t("anomalyAlerts.open")}
              </button>
              {formLink && (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(formLink);
                      pushToast({ kind: "success", title: "Link do Flux Forms copiado." });
                    } catch {
                      pushToast({ kind: "error", title: "Não foi possível copiar o link." });
                    }
                  }}
                >
                  Flux Forms
                </button>
              )}
              <button type="button" className="btn-secondary" onClick={() => setPortalOpen(true)}>
                {t("portal.open")}
              </button>
              {user.isAdmin && (
                <>
                  <button type="button" className="btn-secondary" onClick={() => setTemplateExportOpen(true)}>
                    Template
                  </button>
                  <button type="button" className="btn-secondary" onClick={() => setEmbedOpen(true)}>
                    Widget
                  </button>
                </>
              )}
              <div
                className={`flex items-center gap-1 text-xs font-semibold transition-opacity font-display ${
                  saveStatus === "idle" ? "opacity-0" : "opacity-100"
                } ${saveStatus === "error" ? "text-[var(--flux-danger)]" : "text-[var(--flux-secondary)]"}`}
              >
                <div
                  className={`w-1.5 h-1.5 rounded-full ${
                    saveStatus === "error" ? "bg-[var(--flux-danger)]" : "bg-[var(--flux-secondary)]"
                  }`}
                />
                <span>
                  {saveStatus === "error"
                    ? t("status.errorApi")
                    : saveStatus === "saving"
                      ? t("status.saving")
                      : t("status.saved")}
                </span>
              </div>
            </div>
          </Header>

          <KanbanBoard
            boardName={boardName}
            boardId={boardId}
            getHeaders={getHeaders}
            filterLabels={FILTER_LABELS}
            priorities={PRIORITIES}
            progresses={PROGRESSES}
            directions={DIRECTIONS}
          />
        </div>
      </DataFadeIn>

      <BoardAutomationsModal
        open={automationsOpen}
        onClose={() => setAutomationsOpen(false)}
        boardId={boardId}
        bucketKeys={db.config.bucketOrder.map((b) => b.key)}
        priorities={PRIORITIES}
        progresses={PROGRESSES}
        getHeaders={getHeaders}
      />

      <BoardPortalModal
        open={portalOpen}
        onClose={() => setPortalOpen(false)}
        boardId={boardId}
        bucketOrder={db.config.bucketOrder}
        portal={db.portal}
        getHeaders={getHeaders}
        onSaved={(portal) => {
          useBoardStore.getState().updateDbSilent((d) => {
            d.portal = portal;
          });
        }}
      />

      <BoardTemplateExportModal
        open={templateExportOpen}
        onClose={() => setTemplateExportOpen(false)}
        boardId={boardId}
        getHeaders={getHeaders}
      />

      <BoardEmbedModal open={embedOpen} onClose={() => setEmbedOpen(false)} boardId={boardId} getHeaders={getHeaders} />

      <BoardAnomalyNotificationsModal
        open={anomalySettingsOpen}
        onClose={() => setAnomalySettingsOpen(false)}
        boardId={boardId}
        initial={db.anomalyNotifications}
        getHeaders={getHeaders}
        onSaved={(next) => {
          useBoardStore.getState().updateDbSilent((d) => {
            d.anomalyNotifications = next;
          });
        }}
      />

      <BoardCopilotPanel boardId={boardId} boardName={boardName} getHeaders={getHeaders} />
    </div>
  );
}

