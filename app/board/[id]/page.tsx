"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useAuth } from "@/context/auth-context";
import { Header } from "@/components/header";
import { KanbanBoard } from "@/components/kanban/kanban-board";
import { BoardCopilotPanel } from "@/components/kanban/board-copilot-panel";
import { apiFetch, apiPut } from "@/lib/api-client";
import { useToast } from "@/context/toast-context";
import { registerBoardVisit } from "@/lib/board-shortcuts";

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
  order: number;
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
}

const DEFAULT_BUCKETS: BucketConfig[] = [
  { key: "Refinamento Negócio/Técnico", label: "Refinamento", color: "#9B97C2" },
  { key: "Backlog", label: "Backlog", color: "#6C5CE7" },
  { key: "Priorizado", label: "Priorizado", color: "#00D2D3" },
  { key: "Em Execução (Desenvolvimento)", label: "Em Execução", color: "#FDA7DF" },
  { key: "Incidente", label: "Incidente", color: "#FFD93D" },
  { key: "Em Produção", label: "Em Produção", color: "#00E676" },
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
  const [db, setDb] = useState<BoardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const saveRequestSeqRef = useRef(0);

  useEffect(() => {
    if (!isChecked || !user) {
      router.replace(`${localeRoot}/login`);
      return;
    }
    if (!boardId) {
      router.replace(`${localeRoot}/boards`);
      return;
    }
    loadBoard();
  }, [isChecked, user, boardId, router, localeRoot]);

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
        direction: c.direction ?? null,
        tags: Array.isArray(c.tags) ? c.tags : [],
        links: Array.isArray(c.links) ? c.links.filter((l) => l && typeof l.url === "string" && l.url.trim()) : [],
        docRefs: Array.isArray(c.docRefs)
          ? c.docRefs
              .filter((d) => d && typeof d.docId === "string" && d.docId.trim())
              .map((d) => ({ docId: String(d.docId), title: d.title ? String(d.title) : undefined, excerpt: d.excerpt ? String(d.excerpt) : undefined }))
          : [],
      }));
      setDb({
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
      const toSave = data ?? db;
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
              await apiPut(`/api/boards/${boardId}`, payload, getHeaders());
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
    [db, boardId, getHeaders, t]
  );

  const updateDb = useCallback(
    (updater: (prev: BoardData) => BoardData) => {
      setDb((prev) => {
        if (!prev) return null;
        const next = updater(prev);
        persist(next);
        return next;
      });
    },
    [persist]
  );

  if (!user) return null;
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--flux-surface-dark)]">
        <p className="text-[var(--flux-text-muted)]">{t("loading")}</p>
      </div>
    );
  }
  if (!db) return null;
  const formSlug = String(db.intakeForm?.slug || "").trim();
  const formLink =
    formSlug && typeof window !== "undefined"
      ? `${window.location.origin}/${locale}/forms/${encodeURIComponent(formSlug)}`
      : "";

  return (
    <div className="min-h-screen bg-[var(--flux-surface-dark)]">
      <Header title={boardName}>
        <div className="flex flex-wrap items-center justify-end gap-2">
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
        db={db}
        updateDb={updateDb}
        boardName={boardName}
        boardId={boardId}
        getHeaders={getHeaders}
        filterLabels={FILTER_LABELS}
        priorities={PRIORITIES}
        progresses={PROGRESSES}
        directions={DIRECTIONS}
      />

      <BoardCopilotPanel
        boardId={boardId}
        boardName={boardName}
        getHeaders={getHeaders}
        updateDb={updateDb}
      />
    </div>
  );
}
