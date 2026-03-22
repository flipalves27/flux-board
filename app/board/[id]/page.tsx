"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useAuth } from "@/context/auth-context";
import { Header } from "@/components/header";
import { KanbanBoard } from "@/components/kanban";
import { BoardCopilotPanel } from "@/components/kanban/board-copilot-panel";
import { BoardActivityPanel } from "@/components/kanban/board-activity-panel";
import dynamic from "next/dynamic";
const SprintPanel = dynamic(() => import("@/components/kanban/sprint-panel"), { ssr: false });
import { BoardAutomationsModal } from "@/components/kanban/board-automations-modal";
import { BoardPortalModal, type PortalClientState } from "@/components/kanban/board-portal-modal";
import { BoardTemplateExportModal } from "@/components/board/board-template-export-modal";
import { BoardEmbedModal } from "@/components/board/board-embed-modal";
import { BoardAnomalyNotificationsModal } from "@/components/kanban/board-anomaly-notifications-modal";
import type { BoardAnomalyNotifications } from "@/lib/anomaly-board-settings";
import { apiFetch, getApiHeaders } from "@/lib/api-client";
import { useToast } from "@/context/toast-context";
import { registerBoardVisit } from "@/lib/board-shortcuts";
import { normalizeBoardForPersist } from "@/lib/board-persist-normalize";
import { setBoardPersistenceHandler, useBoardStore, triggerCsvExport, triggerCsvImport } from "@/stores/board-store";
import { useKanbanUiStore } from "@/stores/ui-store";
import { useCopilotStore } from "@/stores/copilot-store";
import { useBoardNlqUiStore } from "@/stores/board-nlq-ui-store";
import { useSprintStore } from "@/stores/sprint-store";
import { useMinimumSkeletonDuration } from "@/lib/use-minimum-skeleton-duration";
import { DataFadeIn } from "@/components/ui/data-fade-in";
import { SkeletonKanbanBoard } from "@/components/skeletons/flux-skeletons";
import { BoardRouteLoadingFallback } from "@/components/skeletons/route-loading-fallbacks";
import { BoardProductTour, type BoardProductTourHandle } from "@/components/board/board-product-tour";
import { BoardPresenceAvatars } from "@/components/kanban/board-presence-avatars";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { CustomTooltip } from "@/components/ui/custom-tooltip";

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

/** Checklist Definition of Ready (refinamento) — opcional por card. */
export type CardDorReady = {
  titleOk?: boolean;
  acceptanceOk?: boolean;
  depsOk?: boolean;
  sizedOk?: boolean;
};

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
  completedAt?: string;
  completedCycleDays?: number;
  automationState?: { lastFired?: Record<string, string> };
  dorReady?: CardDorReady;
}

export interface BucketConfig {
  key: string;
  label: string;
  color: string;
  /** Limite WIP (opcional). */
  wipLimit?: number;
  /** Como o time usa esta coluna (política explícita). */
  policy?: string;
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

function sanitizeBucketOrder(raw: unknown): BucketConfig[] {
  if (!Array.isArray(raw)) return DEFAULT_BUCKETS;
  const normalized = raw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const rec = item as Partial<BucketConfig>;
      const key = typeof rec.key === "string" ? rec.key.trim() : "";
      const label = typeof rec.label === "string" ? rec.label.trim() : "";
      const color = typeof rec.color === "string" ? rec.color.trim() : "";
      if (!key) return null;
      let wipLimit: number | undefined;
      if (typeof rec.wipLimit === "number" && Number.isFinite(rec.wipLimit)) {
        const w = Math.floor(rec.wipLimit);
        if (w >= 1 && w <= 999) wipLimit = w;
      }
      const policyRaw = typeof rec.policy === "string" ? rec.policy.trim().slice(0, 500) : "";
      return {
        key,
        label: label || key,
        color: color || "var(--flux-text-muted)",
        ...(wipLimit !== undefined ? { wipLimit } : {}),
        ...(policyRaw ? { policy: policyRaw } : {}),
      };
    })
    .filter((b): b is BucketConfig => b !== null);
  if (normalized.length === 0) return DEFAULT_BUCKETS;
  const seen = new Set<string>();
  return normalized.filter((b) => {
    const id = b.key.toLowerCase();
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function sanitizeCollapsedColumns(raw: unknown, bucketOrder: BucketConfig[]): string[] {
  if (!Array.isArray(raw)) return [];
  const allowed = new Set(bucketOrder.map((b) => b.key));
  return raw
    .filter((key): key is string => typeof key === "string" && key.trim().length > 0)
    .map((key) => key.trim())
    .filter((key) => allowed.has(key));
}

function sanitizeLabels(raw: unknown): string[] {
  if (!Array.isArray(raw) || raw.length === 0) return FILTER_LABELS;
  const labels = raw.filter((label): label is string => typeof label === "string" && label.trim().length > 0);
  return labels.length > 0 ? labels : FILTER_LABELS;
}

function sanitizeDorReady(raw: unknown): CardDorReady | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const pick = (k: string) => o[k] === true;
  const any =
    pick("titleOk") || pick("acceptanceOk") || pick("depsOk") || pick("sizedOk");
  if (!any) return undefined;
  return {
    ...(pick("titleOk") ? { titleOk: true } : {}),
    ...(pick("acceptanceOk") ? { acceptanceOk: true } : {}),
    ...(pick("depsOk") ? { depsOk: true } : {}),
    ...(pick("sizedOk") ? { sizedOk: true } : {}),
  };
}

export default function BoardPage() {
  const router = useRouter();
  const params = useParams();
  const boardId = Array.isArray(params.id) ? params.id[0] ?? "" : (params.id as string);
  const { user, getHeaders, isChecked, setAuth } = useAuth();
  const { pushToast } = useToast();
  const locale = useLocale();
  const t = useTranslations("board");
  const tTour = useTranslations("board.productTour");
  const [boardName, setBoardName] = useState("Board");
  const [clientLabel, setClientLabel] = useState<string | null>(null);
  const [tourStep, setTourStep] = useState<number | null>(null);
  const tourRef = useRef<BoardProductTourHandle | null>(null);
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
  const tBoardRef = useRef(t);
  tBoardRef.current = t;
  const csvImportMode = useKanbanUiStore((s) => s.csvImportMode);
  const setCsvImportMode = useKanbanUiStore((s) => s.setCsvImportMode);
  const [formOrigin, setFormOrigin] = useState("");

  const authWaiting = !isChecked || !user;
  const showBoardSkeleton = useMinimumSkeletonDuration(!authWaiting && loading);
  const tourExpandFilters = tourStep === 5;

  /** next/navigation `useRouter()` pode mudar identidade entre renders — evita re-disparar loadBoard (#185). */
  const routerRef = useRef(router);
  routerRef.current = router;
  const getHeadersRef = useRef(getHeaders);
  getHeadersRef.current = getHeaders;
  const pushToastRef = useRef(pushToast);
  pushToastRef.current = pushToast;
  const userRef = useRef(user);
  userRef.current = user;

  const loadBoard = useCallback(async () => {
    try {
      const r = await apiFetch(`/api/boards/${boardId}`, {
        cache: "no-store",
        headers: getHeadersRef.current(),
      });
      if (r.status === 401) {
        routerRef.current.replace(`/${locale}/login`);
        return;
      }
      if (r.status === 403) {
        pushToastRef.current({ kind: "error", title: tBoardRef.current("toasts.noPermission") });
        routerRef.current.replace(`/${locale}/boards`);
        return;
      }
      if (!r.ok) throw new Error("Erro ao carregar");
      const d = await r.json();
      setBoardName(d.name || "Board");
      const rawClient = typeof d.clientLabel === "string" ? d.clientLabel.trim() : "";
      setClientLabel(rawClient || null);
      const bucketOrder = sanitizeBucketOrder(d.config?.bucketOrder);
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
        dorReady: sanitizeDorReady((c as CardData).dorReady),
      }));
      useBoardStore.getState().hydrate(boardId, {
        version: d.version || "2.0",
        lastUpdated: d.lastUpdated || "",
        cards,
        config: {
          bucketOrder,
          collapsedColumns: sanitizeCollapsedColumns(d.config?.collapsedColumns, bucketOrder),
          labels: sanitizeLabels(d.config?.labels),
        },
        mapaProducao: d.mapaProducao,
        dailyInsights: Array.isArray(d.dailyInsights) ? d.dailyInsights : [],
        intakeForm: d.intakeForm,
        portal: d.portal,
        anomalyNotifications: d.anomalyNotifications,
      });
      const uid = userRef.current?.id;
      if (uid) {
        registerBoardVisit(uid, boardId);
      }
    } catch {
      pushToastRef.current({ kind: "error", title: tBoardRef.current("toasts.loadError") });
      routerRef.current.replace(`/${locale}/boards`);
    } finally {
      setLoading(false);
    }
  }, [boardId, locale]);

  useEffect(() => {
    if (!isChecked || !user) {
      routerRef.current.replace(`/${locale}/login`);
      return;
    }
    if (!boardId) {
      routerRef.current.replace(`/${locale}/boards`);
      return;
    }
    useKanbanUiStore.getState().resetForBoardSwitch();
    useCopilotStore.getState().resetSessionUi();
    loadBoard();
  }, [isChecked, user?.id, boardId, locale, loadBoard]);

  useEffect(() => {
    const id = boardId;
    return () => {
      useBoardNlqUiStore.getState().clearBoardNlq(id);
    };
  }, [boardId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setFormOrigin(window.location.origin);
  }, []);

  const persist = useCallback(
    (data?: BoardData) => {
      const raw = data ?? useBoardStore.getState().db;
      if (!raw) return;
      const toSave = normalizeBoardForPersist(raw);
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
          pushToast({ kind: "error", title: tBoardRef.current("toasts.saveError") });
          setTimeout(() => {
            if (saveRequestSeqRef.current === requestSeq) setSaveStatus("idle");
          }, 3000);
        } finally {
          saveTimeoutRef.current = null;
        }
      }, 300);
    },
    [boardId, getHeaders]
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
  const formLink = formSlug && formOrigin ? `${formOrigin}/${locale}/forms/${encodeURIComponent(formSlug)}` : "";

  return (
    <div className="min-h-screen bg-[var(--flux-surface-dark)]">
      <DataFadeIn active animate={false} key={boardId}>
        <div>
          <Header
            title={boardName}
            titleLine2={clientLabel ? t("clientLabelInHeader", { label: clientLabel }) : undefined}
            boardTourHeader
          >
            <div className="flex items-center justify-end gap-1.5 flex-wrap">
              {/* Presence */}
              <BoardPresenceAvatars />

              {/* Separator */}
              <div className="w-px h-5 bg-[var(--flux-border-default)] mx-0.5 shrink-0" />

              {/* Feature actions */}
              <button
                type="button"
                className="btn-secondary flex items-center gap-1.5 py-2 px-3 text-sm"
                onClick={() => setAutomationsOpen(true)}
              >
                <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                {t("automations.open")}
              </button>

              <button
                type="button"
                className="btn-secondary flex items-center gap-1.5 py-2 px-3 text-sm"
                onClick={() => setAnomalySettingsOpen(true)}
              >
                <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                {t("anomalyAlerts.open")}
              </button>

              <button
                type="button"
                className="btn-secondary flex items-center gap-1.5 py-2 px-3 text-sm"
                onClick={() => useSprintStore.getState().setPanelOpen(boardId)}
                aria-label="Abrir painel Sprint"
              >
                <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Sprint
              </button>

              <button
                type="button"
                className="btn-secondary flex items-center gap-1.5 py-2 px-3 text-sm"
                onClick={() => setPortalOpen(true)}
              >
                <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                {t("portal.open")}
              </button>

              {formLink && (
                <button
                  type="button"
                  className="btn-secondary flex items-center gap-1.5 py-2 px-3 text-sm"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(formLink);
                      pushToast({ kind: "success", title: "Link do Flux Forms copiado." });
                    } catch {
                      pushToast({ kind: "error", title: "Não foi possível copiar o link." });
                    }
                  }}
                >
                  <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                  </svg>
                  Flux Forms
                </button>
              )}

              {/* Admin tools — collapsed into dropdown */}
              {user.isAdmin && (
                <>
                  <div className="w-px h-5 bg-[var(--flux-border-default)] mx-0.5 shrink-0" />
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="btn-secondary flex items-center gap-1.5 py-2 px-3 text-sm"
                        aria-label="Opções de administrador"
                      >
                        <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        <svg className="w-3 h-3 shrink-0 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" aria-hidden>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="min-w-[160px]">
                      <DropdownMenuItem onSelect={() => setTemplateExportOpen(true)}>
                        <svg className="w-3.5 h-3.5 mr-2 opacity-60 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
                        </svg>
                        Template
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onSelect={() => setEmbedOpen(true)}>
                        <svg className="w-3.5 h-3.5 mr-2 opacity-60 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                        </svg>
                        Widget
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onSelect={() => setCsvImportMode("replace")}
                        className={csvImportMode === "replace" ? "text-[var(--flux-primary-light)]" : ""}
                      >
                        <svg className="w-3.5 h-3.5 mr-2 opacity-60 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        {csvImportMode === "replace" ? "✓ " : ""}Substituir
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() => setCsvImportMode("merge")}
                        className={csvImportMode === "merge" ? "text-[var(--flux-primary-light)]" : ""}
                      >
                        <svg className="w-3.5 h-3.5 mr-2 opacity-60 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                        </svg>
                        {csvImportMode === "merge" ? "✓ " : ""}Mesclar
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onSelect={() => triggerCsvImport()}>
                        <svg className="w-3.5 h-3.5 mr-2 opacity-60 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                        </svg>
                        Importar CSV
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => triggerCsvExport()}>
                        <svg className="w-3.5 h-3.5 mr-2 opacity-60 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        Exportar CSV
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              )}

              {/* Tour — ghost help button, deemphasized */}
              <div className="w-px h-5 bg-[var(--flux-border-default)] mx-0.5 shrink-0" />
              {tourStep !== null ? (
                <button
                  type="button"
                  className="btn-ghost flex items-center gap-1.5 py-2 px-3 text-xs"
                  onClick={() => void tourRef.current?.skip()}
                >
                  {tTour("skip")}
                </button>
              ) : (
                <CustomTooltip
                  content={user?.boardProductTourCompleted ? tTour("redo") : tTour("start")}
                  position="bottom"
                >
                  <button
                    type="button"
                    className="btn-ghost flex items-center justify-center p-2"
                    onClick={() => tourRef.current?.redo()}
                    aria-label={user?.boardProductTourCompleted ? tTour("redo") : tTour("start")}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </button>
                </CustomTooltip>
              )}

              {/* Save status indicator */}
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
            productTourExpandFilters={tourExpandFilters}
            allowExternalMerge={saveStatus !== "saving"}
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

      <SprintPanel boardId={boardId} getHeaders={getHeaders} />

      <BoardActivityPanel boardId={boardId} getHeaders={getHeaders} />

      <BoardProductTour
        ref={tourRef}
        user={user}
        setAuth={setAuth}
        getHeaders={getHeaders}
        tourStep={tourStep}
        onTourStepChange={setTourStep}
      />
    </div>
  );
}

