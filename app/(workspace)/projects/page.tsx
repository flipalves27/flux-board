"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { Header } from "@/components/header";
import { PremiumMetricCard, PremiumPageShell, PremiumSectionHeader, PremiumSurface } from "@/components/ui/premium-primitives";
import { apiGet, apiPost } from "@/lib/api-client";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/context/toast-context";

type ProjectStatus = "active" | "paused" | "at_risk" | "completed" | "archived";
type ProjectHealth = "green" | "yellow" | "red" | "blocked";
type ProjectDeliveryModel = "scrum" | "kanban" | "safe" | "hybrid" | "lean_six_sigma" | "discovery";

interface ProjectRow {
  id: string;
  name: string;
  description?: string | null;
  status: ProjectStatus;
  health: ProjectHealth;
  progressPct?: number | null;
  deliveryModel: ProjectDeliveryModel;
  targetDate?: string | null;
  boardCount?: number;
  financials?: { budget?: number | null; actualCost?: number | null; forecastCost?: number | null; currency?: string };
  roadmap?: Array<{ id: string; title: string; status?: string; targetDate?: string | null }>;
}

function healthLabel(health: ProjectHealth) {
  if (health === "green") return "Saudavel";
  if (health === "yellow") return "Atencao";
  if (health === "red") return "Risco alto";
  return "Bloqueado";
}

function deliveryLabel(model: ProjectDeliveryModel) {
  return {
    scrum: "Scrum",
    kanban: "Kanban",
    safe: "SAFe",
    hybrid: "Hibrido",
    lean_six_sigma: "Lean Six Sigma",
    discovery: "Discovery",
  }[model];
}

export default function ProjectsPage() {
  const { user, getHeaders, isChecked } = useAuth();
  const { pushToast } = useToast();
  const router = useRouter();
  const locale = useLocale();
  const localeRoot = `/${locale}`;
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState("");
  const [deliveryModel, setDeliveryModel] = useState<ProjectDeliveryModel>("hybrid");

  useEffect(() => {
    if (!isChecked) return;
    if (!user) {
      router.replace(`${localeRoot}/login`);
      return;
    }
    let cancelled = false;
    async function load() {
      try {
        const data = await apiGet<{ projects: ProjectRow[] }>("/api/projects", getHeaders());
        if (!cancelled) setProjects(data.projects ?? []);
      } catch {
        if (!cancelled) setProjects([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [getHeaders, isChecked, localeRoot, router, user]);

  const summary = useMemo(() => {
    const active = projects.filter((project) => project.status !== "archived");
    return {
      active: active.length,
      boards: active.reduce((acc, project) => acc + (project.boardCount ?? 0), 0),
      atRisk: active.filter((project) => project.health === "red" || project.health === "blocked" || project.status === "at_risk").length,
      budget: active.reduce((acc, project) => acc + (project.financials?.budget ?? 0), 0),
    };
  }, [projects]);

  async function createProject() {
    try {
      const payload = {
        name: name.trim() || "Novo Projeto",
        deliveryModel,
        governance: {
          steeringCadence: deliveryModel === "safe" ? "PI Planning e sync quinzenal" : "Review quinzenal",
          riskAppetite: "medium",
          approvalThresholds: ["Mudancas de prazo, escopo ou budget devem ser registradas no projeto."],
        },
        financials: { currency: "BRL", costModel: deliveryModel === "safe" ? "value_stream" : "capacity" },
        roadmap: [],
        ai: {
          guardrails: [
            "Nao inventar numeros ausentes.",
            "Explicar recomendacoes com base nos boards vinculados.",
            "Sinalizar incerteza sobre custo, prazo ou capacidade.",
          ],
        },
      };
      const data = await apiPost<{ project: ProjectRow }>("/api/projects", payload, getHeaders());
      setProjects((current) => [data.project, ...current]);
      setModalOpen(false);
      setName("");
      router.push(`${localeRoot}/projects/${data.project.id}`);
    } catch {
      pushToast({ kind: "error", title: "Erro ao criar projeto." });
    }
  }

  return (
    <div className="flux-page-contract min-h-screen" data-flux-area="projects">
      <Header />
      <PremiumPageShell>
        <PremiumSectionHeader
          eyebrow="Projetos"
          title="Cockpit de projetos"
          description="Agrupe boards por iniciativa, acompanhe governanca, custos, roadmap, riscos e IA em uma camada executiva."
          action={
            <button className="btn-primary" onClick={() => setModalOpen(true)}>
              Novo projeto
            </button>
          }
        />

        <section className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-4">
          <PremiumMetricCard label="Projetos ativos" value={summary.active} hint="Inclui projetos em atencao e pausados." />
          <PremiumMetricCard label="Boards vinculados" value={summary.boards} hint="Todos com projectId apos migracao." />
          <PremiumMetricCard label="Em risco" value={summary.atRisk} hint="Health red, blocked ou status at_risk." />
          <PremiumMetricCard label="Budget planejado" value={summary.budget ? `R$ ${summary.budget.toLocaleString("pt-BR")}` : "-"} hint="Soma dos budgets preenchidos." />
        </section>

        {loading ? (
          <PremiumSurface className="p-6 text-sm text-[var(--flux-text-muted)]">Carregando projetos...</PremiumSurface>
        ) : projects.length === 0 ? (
          <PremiumSurface className="p-8 text-center">
            <h2 className="font-display text-lg font-bold text-[var(--flux-text)]">Nenhum projeto ainda</h2>
            <p className="mt-2 text-sm text-[var(--flux-text-muted)]">
              Crie um projeto para vincular boards, roadmap, custos e governanca.
            </p>
          </PremiumSurface>
        ) : (
          <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {projects.map((project) => {
              const nextMilestone = (project.roadmap ?? []).find((item) => item.status !== "done");
              return (
                <button
                  key={project.id}
                  type="button"
                  onClick={() => router.push(`${localeRoot}/projects/${project.id}`)}
                  className="group text-left"
                >
                  <PremiumSurface className="h-full p-5 transition-transform duration-200 group-hover:-translate-y-0.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="truncate font-display text-lg font-bold text-[var(--flux-text)]">{project.name}</h2>
                        <p className="mt-1 line-clamp-2 text-sm text-[var(--flux-text-muted)]">
                          {project.description || "Projeto com governanca, boards, roadmap, custos e IA."}
                        </p>
                      </div>
                      <span className="rounded-full border border-[var(--flux-primary-alpha-28)] bg-[var(--flux-primary-alpha-10)] px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-[var(--flux-primary-light)]">
                        {healthLabel(project.health)}
                      </span>
                    </div>
                    <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <p className="text-[var(--flux-text-muted)]">Boards</p>
                        <p className="font-display text-xl font-bold text-[var(--flux-text)]">{project.boardCount ?? 0}</p>
                      </div>
                      <div>
                        <p className="text-[var(--flux-text-muted)]">Modelo</p>
                        <p className="font-semibold text-[var(--flux-text)]">{deliveryLabel(project.deliveryModel)}</p>
                      </div>
                      <div>
                        <p className="text-[var(--flux-text-muted)]">Progresso</p>
                        <p className="font-semibold text-[var(--flux-text)]">{project.progressPct ?? 0}%</p>
                      </div>
                    </div>
                    <div className="mt-4 h-2 overflow-hidden rounded-full bg-[var(--flux-chrome-alpha-12)]">
                      <div
                        className="h-full rounded-full bg-[var(--flux-primary)]"
                        style={{ width: `${Math.max(0, Math.min(100, project.progressPct ?? 0))}%` }}
                      />
                    </div>
                    <p className="mt-4 text-xs text-[var(--flux-text-muted)]">
                      Proximo marco: <span className="text-[var(--flux-text)]">{nextMilestone?.title ?? "Definir roadmap"}</span>
                    </p>
                  </PremiumSurface>
                </button>
              );
            })}
          </section>
        )}
      </PremiumPageShell>

      {modalOpen ? (
        <div className="fixed inset-0 z-[var(--flux-z-modal-base)] flex items-center justify-center bg-black/60" onClick={() => setModalOpen(false)}>
          <div className="min-w-[340px] rounded-[var(--flux-rad)] border border-[var(--flux-primary-alpha-20)] bg-[var(--flux-surface-card)] p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-4 font-display font-bold text-[var(--flux-text)]">Novo projeto</h3>
            <label className="mb-1 block text-xs font-semibold text-[var(--flux-text-muted)]">Nome</label>
            <input className="flux-input-modern mb-4 w-full" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            <label className="mb-1 block text-xs font-semibold text-[var(--flux-text-muted)]">Modelo de entrega</label>
            <select className="flux-input-modern mb-5 w-full" value={deliveryModel} onChange={(e) => setDeliveryModel(e.target.value as ProjectDeliveryModel)}>
              <option value="hybrid">Hibrido</option>
              <option value="scrum">Scrum</option>
              <option value="kanban">Kanban</option>
              <option value="safe">SAFe</option>
              <option value="lean_six_sigma">Lean Six Sigma</option>
              <option value="discovery">Discovery</option>
            </select>
            <div className="flex justify-end gap-3">
              <button className="btn-secondary" onClick={() => setModalOpen(false)}>Cancelar</button>
              <button className="btn-primary" onClick={createProject}>Criar</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
