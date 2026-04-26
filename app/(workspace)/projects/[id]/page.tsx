"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale } from "next-intl";
import { useParams, useRouter } from "next/navigation";
import { Header } from "@/components/header";
import { PremiumMetricCard, PremiumPageShell, PremiumSectionHeader, PremiumSurface } from "@/components/ui/premium-primitives";
import { apiGet, apiPost, apiPut } from "@/lib/api-client";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/context/toast-context";

type TabKey = "overview" | "boards" | "roadmap" | "schedule" | "costs" | "strategy" | "risks" | "ai" | "settings";

interface Project {
  id: string;
  name: string;
  description?: string | null;
  status: string;
  health: string;
  progressPct?: number | null;
  confidence?: number | null;
  deliveryModel: string;
  cadence?: string | null;
  planningPolicy?: string | null;
  vision?: string | null;
  businessOutcome?: string | null;
  strategicThemes?: string[];
  okrs?: Array<{ id: string; objective: string; keyResults: string[]; progressPct?: number | null }>;
  governance?: {
    sponsor?: string | null;
    productOwner?: string | null;
    projectManager?: string | null;
    stakeholders?: string[];
    steeringCadence?: string | null;
    riskAppetite?: string;
    approvalThresholds?: string[];
    decisionLog?: Array<{ id: string; date: string; decision: string; owner?: string | null }>;
  };
  financials?: {
    budget?: number | null;
    actualCost?: number | null;
    forecastCost?: number | null;
    monthlyRunRate?: number | null;
    currency?: string;
    costModel?: string;
    variance?: number | null;
  };
  roadmap?: Array<{
    id: string;
    title: string;
    type: string;
    status?: string;
    startDate?: string | null;
    targetDate?: string | null;
    confidence?: number | null;
    linkedBoardIds?: string[];
  }>;
}

interface BoardRow {
  boardId?: string;
  id?: string;
  name: string;
  methodology?: string;
  boardMethodology?: string;
  lastUpdated?: string;
  metrics?: { cardCount: number; risco?: number | null; throughput?: number | null; previsibilidade?: number | null };
  portfolio?: { cardCount: number; risco?: number | null; throughput?: number | null; previsibilidade?: number | null };
}

interface Dashboard {
  health: string;
  status: string;
  progressPct?: number | null;
  confidence?: number | null;
  boards: {
    count: number;
    riskCount: number;
    avgRisco?: number | null;
    avgThroughput?: number | null;
    avgPrevisibilidade?: number | null;
    rows: BoardRow[];
  };
  strategy: {
    strategicThemes: string[];
    okrs: Project["okrs"];
    northStarMetric?: string | null;
    successCriteria: string[];
  };
  governance: Project["governance"] & { blockedMilestones?: number; rolloutRisk?: string; policy?: string | null };
  financials: Project["financials"] & { forecastStatus?: string };
  roadmap: { items: NonNullable<Project["roadmap"]>; upcomingMilestones: NonNullable<Project["roadmap"]>; blockedMilestones: number };
  ai: { guardrails: string[]; recommendations: Array<{ id: string; summary: string }>; suggestedPrompts: string[] };
  validation: { successMetrics: string[]; rolloutGates: string[] };
}

const tabs: Array<{ key: TabKey; label: string }> = [
  { key: "overview", label: "Visao geral" },
  { key: "boards", label: "Boards" },
  { key: "roadmap", label: "Roadmap" },
  { key: "schedule", label: "Cronograma" },
  { key: "costs", label: "Custos" },
  { key: "strategy", label: "Estrategia" },
  { key: "risks", label: "Riscos" },
  { key: "ai", label: "IA" },
  { key: "settings", label: "Configuracoes" },
];

function money(value?: number | null, currency = "BRL") {
  if (!value) return "-";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(value);
}

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const { user, getHeaders, isChecked } = useAuth();
  const { pushToast } = useToast();
  const router = useRouter();
  const locale = useLocale();
  const localeRoot = `/${locale}`;
  const [project, setProject] = useState<Project | null>(null);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabKey>("overview");
  const [aiMessage, setAiMessage] = useState("");
  const [aiReply, setAiReply] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [settingsName, setSettingsName] = useState("");

  useEffect(() => {
    if (!isChecked) return;
    if (!user) {
      router.replace(`${localeRoot}/login`);
      return;
    }
    let cancelled = false;
    async function load() {
      try {
        const data = await apiGet<{ project: Project; dashboard: Dashboard }>(`/api/projects/${projectId}/dashboard`, getHeaders());
        if (cancelled) return;
        setProject(data.project);
        setDashboard(data.dashboard);
        setSettingsName(data.project.name);
      } catch {
        if (!cancelled) {
          setProject(null);
          setDashboard(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [getHeaders, isChecked, localeRoot, projectId, router, user]);

  const costVariance = useMemo(() => {
    const budget = project?.financials?.budget ?? 0;
    const forecast = project?.financials?.forecastCost ?? project?.financials?.actualCost ?? 0;
    if (!budget) return null;
    return Math.round(((forecast - budget) / budget) * 100);
  }, [project]);

  async function askProjectAi(message?: string) {
    const text = (message ?? aiMessage).trim();
    if (!text) return;
    setAiLoading(true);
    setAiReply("");
    try {
      const data = await apiPost<{ reply: string }>(`/api/projects/${projectId}/ai`, { message: text }, getHeaders());
      setAiReply(data.reply);
      setAiMessage(text);
    } catch {
      pushToast({ kind: "error", title: "Erro ao consultar IA do projeto." });
    } finally {
      setAiLoading(false);
    }
  }

  async function saveSettings() {
    if (!project) return;
    try {
      const data = await apiPut<{ project: Project }>(`/api/projects/${project.id}`, { name: settingsName }, getHeaders());
      setProject(data.project);
      pushToast({ kind: "success", title: "Projeto atualizado." });
    } catch {
      pushToast({ kind: "error", title: "Erro ao atualizar projeto." });
    }
  }

  if (loading) {
    return (
      <div className="flux-page-contract min-h-screen">
        <Header />
        <PremiumPageShell>
          <PremiumSurface className="p-6 text-sm text-[var(--flux-text-muted)]">Carregando projeto...</PremiumSurface>
        </PremiumPageShell>
      </div>
    );
  }

  if (!project || !dashboard) {
    return (
      <div className="flux-page-contract min-h-screen">
        <Header />
        <PremiumPageShell>
          <PremiumSurface className="p-6">
            <h1 className="font-display text-lg font-bold text-[var(--flux-text)]">Projeto nao encontrado</h1>
            <button className="btn-primary mt-4" onClick={() => router.push(`${localeRoot}/projects`)}>
              Voltar para projetos
            </button>
          </PremiumSurface>
        </PremiumPageShell>
      </div>
    );
  }

  const currency = project.financials?.currency ?? "BRL";

  return (
    <div className="flux-page-contract min-h-screen" data-flux-area="project-detail">
      <Header />
      <PremiumPageShell>
        <PremiumSectionHeader
          eyebrow={<button className="text-[var(--flux-primary-light)]" onClick={() => router.push(`${localeRoot}/projects`)}>Projetos /</button>}
          title={project.name}
          description={project.description || "Projeto com estrategia, governanca, custos, roadmap, boards e IA contextual."}
          action={<button className="btn-secondary" onClick={() => router.push(`${localeRoot}/boards?projectId=${project.id}`)}>Ver boards</button>}
        />

        <section className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-4">
          <PremiumMetricCard label="Health" value={dashboard.health} hint={`Status: ${dashboard.status}`} />
          <PremiumMetricCard label="Progresso" value={`${dashboard.progressPct ?? 0}%`} hint={`Confianca: ${dashboard.confidence ?? "-"}%`} />
          <PremiumMetricCard label="Boards" value={dashboard.boards.count} hint={`${dashboard.boards.riskCount} com risco de entrega.`} />
          <PremiumMetricCard label="Forecast" value={money(project.financials?.forecastCost, currency)} hint={costVariance === null ? "Budget nao preenchido." : `Variacao vs budget: ${costVariance}%`} />
        </section>

        <div className="flux-premium-tabbar mb-6 overflow-x-auto">
          {tabs.map((item) => (
            <button
              key={item.key}
              className={`px-4 py-2.5 font-display text-sm font-semibold transition-colors ${tab === item.key ? "border-b-2 border-[var(--flux-primary)] text-[var(--flux-primary-light)]" : "text-[var(--flux-text-muted)] hover:text-[var(--flux-text)]"}`}
              onClick={() => setTab(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>

        {tab === "overview" ? (
          <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <PremiumSurface className="p-5">
              <h2 className="font-display text-sm font-bold text-[var(--flux-text)]">Resumo executivo</h2>
              <p className="mt-3 text-sm leading-relaxed text-[var(--flux-text-muted)]">
                {project.businessOutcome || project.vision || "Defina visao, outcome e criterios de sucesso para orientar os boards vinculados."}
              </p>
              <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
                <span>Risco medio: {dashboard.boards.avgRisco ?? "-"}</span>
                <span>Throughput: {dashboard.boards.avgThroughput ?? "-"}</span>
                <span>Previsibilidade: {dashboard.boards.avgPrevisibilidade ?? "-"}</span>
              </div>
            </PremiumSurface>
            <PremiumSurface className="p-5">
              <h2 className="font-display text-sm font-bold text-[var(--flux-text)]">Governanca leve</h2>
              <ul className="mt-3 space-y-2 text-sm text-[var(--flux-text-muted)]">
                <li>Sponsor: {project.governance?.sponsor || "Nao definido"}</li>
                <li>Cadencia: {project.governance?.steeringCadence || project.cadence || "Review quinzenal sugerido"}</li>
                <li>Risco de rollout: {dashboard.governance.rolloutRisk}</li>
              </ul>
            </PremiumSurface>
          </section>
        ) : null}

        {tab === "boards" ? (
          <section className="grid grid-cols-1 gap-3">
            {dashboard.boards.rows.map((board) => {
              const metrics = board.metrics ?? board.portfolio;
              const id = board.boardId ?? board.id;
              return (
                <PremiumSurface key={id} className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h2 className="font-display font-bold text-[var(--flux-text)]">{board.name}</h2>
                    <p className="text-xs text-[var(--flux-text-muted)]">
                      {board.methodology ?? board.boardMethodology ?? "scrum"} · {metrics?.cardCount ?? 0} cards
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs text-[var(--flux-text-muted)]">
                    <span>Risco {metrics?.risco ?? "-"}</span>
                    <span>Throughput {metrics?.throughput ?? "-"}</span>
                    <span>Previsibilidade {metrics?.previsibilidade ?? "-"}</span>
                    {id ? <button className="btn-secondary py-1 text-xs" onClick={() => router.push(`${localeRoot}/board/${id}`)}>Abrir</button> : null}
                  </div>
                </PremiumSurface>
              );
            })}
          </section>
        ) : null}

        {tab === "roadmap" || tab === "schedule" ? (
          <section className="grid grid-cols-1 gap-3">
            {dashboard.roadmap.items.length === 0 ? (
              <PremiumSurface className="p-5 text-sm text-[var(--flux-text-muted)]">Adicione milestones, releases e dependencias para formar o roadmap do projeto.</PremiumSurface>
            ) : dashboard.roadmap.items.map((item) => (
              <PremiumSurface key={item.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-display font-bold text-[var(--flux-text)]">{item.title}</h2>
                    <p className="text-xs text-[var(--flux-text-muted)]">{item.type} · {item.status ?? "planned"}</p>
                  </div>
                  <span className="text-xs text-[var(--flux-text-muted)]">{item.targetDate ?? "Sem data"}</span>
                </div>
              </PremiumSurface>
            ))}
          </section>
        ) : null}

        {tab === "costs" ? (
          <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <PremiumMetricCard label="Budget" value={money(project.financials?.budget, currency)} hint={`Modelo: ${project.financials?.costModel ?? "capacity"}`} />
            <PremiumMetricCard label="Realizado" value={money(project.financials?.actualCost, currency)} hint={`Run rate: ${money(project.financials?.monthlyRunRate, currency)}`} />
            <PremiumMetricCard label="Forecast" value={money(project.financials?.forecastCost, currency)} hint={`Status: ${dashboard.financials.forecastStatus}`} />
          </section>
        ) : null}

        {tab === "strategy" ? (
          <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <PremiumSurface className="p-5">
              <h2 className="font-display text-sm font-bold text-[var(--flux-text)]">Estrategia</h2>
              <p className="mt-3 text-sm text-[var(--flux-text-muted)]">{project.vision || "Defina a visao do projeto."}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {(project.strategicThemes ?? []).map((theme) => (
                  <span key={theme} className="rounded-full border border-[var(--flux-primary-alpha-25)] px-2 py-1 text-xs text-[var(--flux-text)]">{theme}</span>
                ))}
              </div>
            </PremiumSurface>
            <PremiumSurface className="p-5">
              <h2 className="font-display text-sm font-bold text-[var(--flux-text)]">OKRs</h2>
              {(project.okrs ?? []).length === 0 ? <p className="mt-3 text-sm text-[var(--flux-text-muted)]">Sem OKRs vinculados.</p> : null}
              {(project.okrs ?? []).map((okr) => (
                <div key={okr.id} className="mt-3 border-t border-[var(--flux-chrome-alpha-12)] pt-3">
                  <p className="font-semibold text-[var(--flux-text)]">{okr.objective}</p>
                  <p className="text-xs text-[var(--flux-text-muted)]">Progresso {okr.progressPct ?? 0}%</p>
                </div>
              ))}
            </PremiumSurface>
          </section>
        ) : null}

        {tab === "risks" ? (
          <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <PremiumSurface className="p-5">
              <h2 className="font-display text-sm font-bold text-[var(--flux-text)]">Risk Radar</h2>
              <ul className="mt-3 space-y-2 text-sm text-[var(--flux-text-muted)]">
                <li>{dashboard.boards.riskCount} board(s) com risco operacional.</li>
                <li>{dashboard.roadmap.blockedMilestones} marco(s) bloqueados.</li>
                <li>Health atual: {project.health}.</li>
              </ul>
            </PremiumSurface>
            <PremiumSurface className="p-5">
              <h2 className="font-display text-sm font-bold text-[var(--flux-text)]">Decisoes e thresholds</h2>
              {(project.governance?.approvalThresholds ?? dashboard.validation.rolloutGates).map((item) => (
                <p key={item} className="mt-2 text-sm text-[var(--flux-text-muted)]">- {item}</p>
              ))}
            </PremiumSurface>
          </section>
        ) : null}

        {tab === "ai" ? (
          <section className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1.2fr]">
            <PremiumSurface className="p-5">
              <h2 className="font-display text-sm font-bold text-[var(--flux-text)]">Perguntas sugeridas</h2>
              <div className="mt-3 flex flex-col gap-2">
                {dashboard.ai.suggestedPrompts.map((prompt) => (
                  <button key={prompt} className="rounded-[var(--flux-rad)] border border-[var(--flux-primary-alpha-22)] p-2 text-left text-xs text-[var(--flux-text)] hover:border-[var(--flux-primary)]" onClick={() => void askProjectAi(prompt)}>
                    {prompt}
                  </button>
                ))}
              </div>
            </PremiumSurface>
            <PremiumSurface className="p-5">
              <h2 className="font-display text-sm font-bold text-[var(--flux-text)]">Project Copilot</h2>
              <textarea className="flux-input-modern mt-3 min-h-28 w-full" value={aiMessage} onChange={(e) => setAiMessage(e.target.value)} placeholder="Pergunte sobre prazo, custo, risco, roadmap ou trade-offs." />
              <button className="btn-primary mt-3" disabled={aiLoading} onClick={() => void askProjectAi()}>
                {aiLoading ? "Analisando..." : "Perguntar"}
              </button>
              {aiReply ? <div className="mt-4 whitespace-pre-wrap rounded-[var(--flux-rad)] border border-[var(--flux-chrome-alpha-12)] p-3 text-sm text-[var(--flux-text)]">{aiReply}</div> : null}
            </PremiumSurface>
          </section>
        ) : null}

        {tab === "settings" ? (
          <PremiumSurface className="max-w-xl p-5">
            <h2 className="font-display text-sm font-bold text-[var(--flux-text)]">Configuracoes do projeto</h2>
            <label className="mt-4 block text-xs font-semibold text-[var(--flux-text-muted)]">Nome</label>
            <input className="flux-input-modern mt-1 w-full" value={settingsName} onChange={(e) => setSettingsName(e.target.value)} />
            <button className="btn-primary mt-4" onClick={saveSettings}>Salvar</button>
          </PremiumSurface>
        ) : null}
      </PremiumPageShell>
    </div>
  );
}
