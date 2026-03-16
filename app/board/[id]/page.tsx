"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/auth-context";
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
  };
  mapaProducao?: { papel: string; equipe: string; linha: string; operacoes: string }[];
}

const DEFAULT_BUCKETS: BucketConfig[] = [
  { key: "Refinamento Negócio/Técnico", label: "Refinamento", color: "#9CA3AF" },
  { key: "Backlog", label: "Backlog", color: "#8B5CF6" },
  { key: "Priorizado", label: "Priorizado", color: "#0A1F3F" },
  { key: "Em Execução (Desenvolvimento)", label: "Em Execução", color: "#00C9B7" },
  { key: "Incidente", label: "Incidente", color: "#F97316" },
  { key: "Em Produção", label: "Em Produção", color: "#10B981" },
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
        config: d.config || {
          bucketOrder: DEFAULT_BUCKETS,
          collapsedColumns: [],
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
      <div className="min-h-screen flex items-center justify-center bg-[var(--off)]">
        <p className="text-[var(--g600)]">Carregando board...</p>
      </div>
    );
  }
  if (!db) return null;

  return (
    <div className="min-h-screen bg-[var(--off)]">
      <header className="bg-[var(--navy)] sticky top-0 z-[200]">
        <div className="max-w-[1900px] mx-auto px-6 py-3.5 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Link
              href="/boards"
              className="flex items-center gap-1.5 text-[var(--g400)] text-sm no-underline mr-2 hover:text-white transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 opacity-80">
                <rect x="3" y="3" width="7" height="7" rx="1" />
                <rect x="14" y="3" width="7" height="7" rx="1" />
                <rect x="3" y="14" width="7" height="7" rx="1" />
                <rect x="14" y="14" width="7" height="7" rx="1" />
              </svg>
              Boards
            </Link>
            <div className="w-1 h-6 bg-[var(--teal)] rounded-sm" />
            <h1 className="font-display font-extrabold text-base text-white">
              AUSTRAL <span className="text-[var(--teal)] font-semibold">SEGURADORA</span> —{" "}
              <span>{boardName}</span>
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <div
              className={`flex items-center gap-1 text-xs font-semibold transition-opacity ${
                saveStatus === "idle" ? "opacity-0" : "opacity-100"
              } ${saveStatus === "error" ? "text-[var(--red)]" : "text-[var(--teal)]"}`}
            >
              <div
                className={`w-1.5 h-1.5 rounded-full ${
                  saveStatus === "error" ? "bg-[var(--red)]" : "bg-[var(--teal)]"
                }`}
              />
              <span>{saveStatus === "error" ? "Erro API" : "Salvo"}</span>
            </div>
          </div>
        </div>
      </header>

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
