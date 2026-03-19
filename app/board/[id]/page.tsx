"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import { Header } from "@/components/header";
import { KanbanBoard } from "@/components/kanban/kanban-board";
import { apiFetch, apiPut } from "@/lib/api-client";

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

export interface CardData {
  id: string;
  bucket: string;
  priority: string;
  progress: string;
  title: string;
  desc: string;
  tags: string[];
  links?: CardLink[];
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
  const [boardName, setBoardName] = useState("Board");
  const [db, setDb] = useState<BoardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "error">("idle");
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!isChecked || !user) {
      router.replace("/login");
      return;
    }
    if (!boardId) {
      router.replace("/boards");
      return;
    }
    loadBoard();
  }, [isChecked, user, boardId, router]);

  async function loadBoard() {
    try {
      const r = await apiFetch(`/api/boards/${boardId}`, {
        cache: "no-store",
        headers: getHeaders(),
      });
      if (r.status === 401) {
        router.replace("/login");
        return;
      }
      if (r.status === 403) {
        alert("Sem permissão para este board.");
        router.replace("/boards");
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
      });
    } catch {
      alert("Erro ao carregar board.");
      router.replace("/boards");
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
      saveTimeoutRef.current = setTimeout(async () => {
        try {
          await apiPut(`/api/boards/${boardId}`, payload, getHeaders());
          setSaveStatus("saved");
          setTimeout(() => setSaveStatus("idle"), 1500);
        } catch {
          setSaveStatus("error");
          setTimeout(() => setSaveStatus("idle"), 3000);
        }
        saveTimeoutRef.current = null;
      }, 300);
    },
    [db, boardId, getHeaders]
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
        <p className="text-[var(--flux-text-muted)]">Carregando board...</p>
      </div>
    );
  }
  if (!db) return null;

  return (
    <div className="min-h-screen bg-[var(--flux-surface-dark)]">
      <Header title={boardName}>
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
          <span>{saveStatus === "error" ? "Erro API" : "Salvo"}</span>
        </div>
      </Header>

      <KanbanBoard
        db={db}
        updateDb={updateDb}
        boardId={boardId}
        getHeaders={getHeaders}
        filterLabels={FILTER_LABELS}
        priorities={PRIORITIES}
        progresses={PROGRESSES}
        directions={DIRECTIONS}
      />
    </div>
  );
}
