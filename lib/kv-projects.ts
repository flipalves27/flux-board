import { getDb, isMongoConfigured } from "./mongo";
import type { Db } from "mongodb";
import { getStore } from "./storage";
import { sanitizeDeep, sanitizeText } from "./schemas";
import { assignMissingProjectToBoards, countBoardsInProject } from "./kv-boards";

const PROJECT_PREFIX = "flux_project:";
const PROJECTS_INDEX_PREFIX = "flux_projects:";
const PROJECT_COUNTER = "flux_project_counter";
const COL_PROJECTS = "projects";
const COL_COUNTERS = "counters";

export type ProjectStatus = "active" | "paused" | "at_risk" | "completed" | "archived";
export type ProjectHealth = "green" | "yellow" | "red" | "blocked";
export type ProjectDeliveryModel = "scrum" | "kanban" | "safe" | "hybrid" | "lean_six_sigma" | "discovery";

export interface ProjectOkr {
  id: string;
  objective: string;
  keyResults: string[];
  progressPct?: number | null;
}

export interface ProjectGovernance {
  sponsor?: string | null;
  productOwner?: string | null;
  projectManager?: string | null;
  stakeholders?: string[];
  steeringCadence?: string | null;
  riskAppetite?: "low" | "medium" | "high";
  approvalThresholds?: string[];
  decisionLog?: Array<{ id: string; date: string; decision: string; owner?: string | null }>;
}

export interface ProjectFinancials {
  budget?: number | null;
  currency?: string;
  costModel?: "fixed" | "time_and_materials" | "capacity" | "value_stream";
  monthlyRunRate?: number | null;
  actualCost?: number | null;
  forecastCost?: number | null;
  benefits?: string[];
  roi?: number | null;
  burnRate?: number | null;
  variance?: number | null;
}

export interface ProjectRoadmapItem {
  id: string;
  title: string;
  type: "theme" | "milestone" | "release" | "dependency";
  status?: "planned" | "in_progress" | "done" | "blocked";
  startDate?: string | null;
  targetDate?: string | null;
  confidence?: number | null;
  linkedBoardIds?: string[];
  linkedCardIds?: string[];
}

export interface ProjectAiSettings {
  contextPrompt?: string | null;
  analysisPreferences?: string[];
  ragSourceIds?: string[];
  recommendationLog?: Array<{ id: string; createdAt: string; summary: string; source?: string }>;
  guardrails?: string[];
}

export interface ProjectData {
  id: string;
  orgId: string;
  key: string;
  name: string;
  description?: string | null;
  color?: string | null;
  cover?: string | null;
  status: ProjectStatus;
  health: ProjectHealth;
  progressPct?: number | null;
  deliveryModel: ProjectDeliveryModel;
  cadence?: string | null;
  planningPolicy?: string | null;
  definitionOfReady?: string | null;
  vision?: string | null;
  problemStatement?: string | null;
  businessOutcome?: string | null;
  strategicThemes?: string[];
  okrs?: ProjectOkr[];
  northStarMetric?: string | null;
  successCriteria?: string[];
  governance?: ProjectGovernance;
  financials?: ProjectFinancials;
  roadmap?: ProjectRoadmapItem[];
  ai?: ProjectAiSettings;
  startDate?: string | null;
  targetDate?: string | null;
  baselineDate?: string | null;
  confidence?: number | null;
  scopePolicy?: string | null;
  archivedAt?: string | null;
  createdAt: string;
  lastUpdated: string;
}

export type ProjectListRow = ProjectData & { boardCount: number };

type ProjectDoc = Omit<ProjectData, "id"> & { _id: string };

function projectDocToData(doc: ProjectDoc): ProjectData {
  const { _id, ...rest } = doc;
  return { ...rest, id: _id };
}

function projectDataToDoc(project: ProjectData): ProjectDoc {
  const { id, ...rest } = project;
  return { _id: id, ...rest };
}

function projectsIndexKey(orgId: string): string {
  return PROJECTS_INDEX_PREFIX + orgId;
}

function projectKey(orgId: string, projectId: string): string {
  return `${PROJECT_PREFIX}${orgId}:${projectId}`;
}

function slugifyProjectKey(input: string): string {
  const base = sanitizeText(input)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return base || "projeto";
}

function defaultProjectIdForOrg(orgId: string): string {
  const clean = String(orgId || "org")
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .slice(0, 80);
  return `prj_default_${clean || "org"}`;
}

async function nextProjectIdMongo(db: Db): Promise<string> {
  const r = await db.collection<{ _id: string; seq: number }>(COL_COUNTERS).findOneAndUpdate(
    { _id: "project" },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: "after" }
  );
  const seq = r?.seq;
  if (typeof seq !== "number") throw new Error("project counter failed");
  return `prj_${seq}`;
}

async function nextProjectIdKv(): Promise<string> {
  const store = await getStore();
  const counter = (((await store.get<number>(PROJECT_COUNTER)) as number) || 0) + 1;
  await store.set(PROJECT_COUNTER, counter);
  return `prj_${counter}`;
}

let projectIndexesEnsured = false;
async function ensureProjectIndexes(db: Db): Promise<void> {
  if (projectIndexesEnsured) return;
  await db.collection<ProjectDoc>(COL_PROJECTS).createIndex({ orgId: 1, key: 1 });
  await db.collection<ProjectDoc>(COL_PROJECTS).createIndex({ orgId: 1, status: 1 });
  await db.collection<ProjectDoc>(COL_PROJECTS).createIndex({ orgId: 1, archivedAt: 1 });
  projectIndexesEnsured = true;
}

function normalizeProjectInput(input: Partial<ProjectData>, now: string): Omit<ProjectData, "id"> {
  const clean = sanitizeDeep(input);
  const name = sanitizeText(clean.name ?? "Novo Projeto").trim().slice(0, 160) || "Novo Projeto";
  const key = slugifyProjectKey(clean.key || name);
  const deliveryModel = clean.deliveryModel ?? "hybrid";
  return {
    orgId: String(clean.orgId || "").trim(),
    key,
    name,
    description: clean.description ? sanitizeText(clean.description).trim().slice(0, 2000) : null,
    color: clean.color ? sanitizeText(clean.color).trim().slice(0, 40) : null,
    cover: clean.cover ? sanitizeText(clean.cover).trim().slice(0, 500) : null,
    status: clean.status ?? "active",
    health: clean.health ?? "green",
    progressPct: typeof clean.progressPct === "number" ? Math.max(0, Math.min(100, clean.progressPct)) : null,
    deliveryModel,
    cadence: clean.cadence ? sanitizeText(clean.cadence).trim().slice(0, 200) : null,
    planningPolicy: clean.planningPolicy ? sanitizeText(clean.planningPolicy).trim().slice(0, 1000) : null,
    definitionOfReady: clean.definitionOfReady ? sanitizeText(clean.definitionOfReady).trim().slice(0, 1000) : null,
    vision: clean.vision ? sanitizeText(clean.vision).trim().slice(0, 2000) : null,
    problemStatement: clean.problemStatement ? sanitizeText(clean.problemStatement).trim().slice(0, 2000) : null,
    businessOutcome: clean.businessOutcome ? sanitizeText(clean.businessOutcome).trim().slice(0, 2000) : null,
    strategicThemes: Array.isArray(clean.strategicThemes) ? clean.strategicThemes.map((v) => sanitizeText(v).trim()).filter(Boolean).slice(0, 20) : [],
    okrs: Array.isArray(clean.okrs) ? clean.okrs.slice(0, 20) : [],
    northStarMetric: clean.northStarMetric ? sanitizeText(clean.northStarMetric).trim().slice(0, 300) : null,
    successCriteria: Array.isArray(clean.successCriteria) ? clean.successCriteria.map((v) => sanitizeText(v).trim()).filter(Boolean).slice(0, 30) : [],
    governance: clean.governance ?? {},
    financials: clean.financials ?? { currency: "BRL" },
    roadmap: Array.isArray(clean.roadmap) ? clean.roadmap.slice(0, 100) : [],
    ai: clean.ai ?? {
      guardrails: [
        "Nao inventar numeros ausentes no contexto.",
        "Citar boards, cards ou campos usados para cada recomendacao.",
        "Sinalizar incerteza quando dados de custo, prazo ou capacidade estiverem incompletos.",
      ],
    },
    startDate: clean.startDate ?? null,
    targetDate: clean.targetDate ?? null,
    baselineDate: clean.baselineDate ?? null,
    confidence: typeof clean.confidence === "number" ? Math.max(0, Math.min(100, clean.confidence)) : null,
    scopePolicy: clean.scopePolicy ? sanitizeText(clean.scopePolicy).trim().slice(0, 1000) : null,
    archivedAt: clean.archivedAt ?? null,
    createdAt: clean.createdAt ?? now,
    lastUpdated: now,
  };
}

export function defaultProjectSeed(orgId: string): Omit<ProjectData, "id"> {
  const now = new Date().toISOString();
  return normalizeProjectInput(
    {
      orgId,
      key: "boards-legados",
      name: "Boards Legados",
      description: "Projeto padrão criado automaticamente para manter todos os boards vinculados a um projeto.",
      deliveryModel: "hybrid",
      cadence: "Revisão mensal",
      planningPolicy: "Agrupa boards existentes até que sejam realocados para projetos específicos.",
      vision: "Preservar continuidade operacional durante a transição para projetos hierárquicos.",
      businessOutcome: "100% dos boards com contexto de projeto sem regressão na operação diária.",
      strategicThemes: ["Governanca", "Migracao segura"],
      governance: {
        steeringCadence: "Mensal",
        riskAppetite: "medium",
        approvalThresholds: ["Mover boards entre projetos deve ser feito por gestores."],
        decisionLog: [],
      },
      financials: { currency: "BRL", costModel: "capacity" },
      roadmap: [
        {
          id: "legacy-reallocation",
          title: "Realocar boards legados para projetos definitivos",
          type: "milestone",
          status: "planned",
          confidence: 70,
          linkedBoardIds: [],
          linkedCardIds: [],
        },
      ],
    },
    now
  );
}

export async function ensureDefaultProjectForOrg(orgId: string): Promise<ProjectData> {
  if (isMongoConfigured()) {
    const db = await getDb();
    await ensureProjectIndexes(db);
    const existing = await db.collection<ProjectDoc>(COL_PROJECTS).findOne({ orgId, key: "boards-legados" });
    if (existing) return projectDocToData(existing);
    const seed = defaultProjectSeed(orgId);
    const project: ProjectData = { id: defaultProjectIdForOrg(orgId), ...seed };
    await db
      .collection<ProjectDoc>(COL_PROJECTS)
      .updateOne({ _id: project.id, orgId }, { $setOnInsert: projectDataToDoc(project) }, { upsert: true });
    const doc = await db.collection<ProjectDoc>(COL_PROJECTS).findOne({ _id: project.id, orgId });
    return doc ? projectDocToData(doc) : project;
  }

  const store = await getStore();
  const ids = ((await store.get<string[]>(projectsIndexKey(orgId))) as string[]) || [];
  for (const id of ids) {
    const existing = await store.get<ProjectData>(projectKey(orgId, id));
    if (existing?.key === "boards-legados") return existing;
  }
  const project: ProjectData = { id: defaultProjectIdForOrg(orgId), ...defaultProjectSeed(orgId) };
  await store.set(projectKey(orgId, project.id), project);
  await store.set(projectsIndexKey(orgId), [project.id, ...ids.filter((id) => id !== project.id)]);
  return project;
}

export async function ensureOrgBoardsHaveDefaultProject(orgId: string): Promise<{ project: ProjectData; matched: number; modified: number }> {
  const project = await ensureDefaultProjectForOrg(orgId);
  const migration = await assignMissingProjectToBoards(orgId, project.id);
  return { project, ...migration };
}

export async function listProjects(orgId: string, opts?: { includeArchived?: boolean }): Promise<ProjectListRow[]> {
  await ensureOrgBoardsHaveDefaultProject(orgId);
  let projects: ProjectData[];
  if (isMongoConfigured()) {
    const db = await getDb();
    await ensureProjectIndexes(db);
    const filter: Record<string, unknown> = { orgId };
    if (!opts?.includeArchived) filter.archivedAt = null;
    const docs = await db.collection<ProjectDoc>(COL_PROJECTS).find(filter).sort({ lastUpdated: -1 }).toArray();
    projects = docs.map(projectDocToData);
  } else {
    const store = await getStore();
    const ids = ((await store.get<string[]>(projectsIndexKey(orgId))) as string[]) || [];
    projects = [];
    for (const id of ids) {
      const project = await store.get<ProjectData>(projectKey(orgId, id));
      if (!project || (!opts?.includeArchived && project.archivedAt)) continue;
      projects.push(project);
    }
    projects.sort((a, b) => new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime());
  }
  return Promise.all(projects.map(async (project) => ({ ...project, boardCount: await countBoardsInProject(orgId, project.id) })));
}

export async function getProject(orgId: string, projectId: string): Promise<ProjectData | null> {
  await ensureOrgBoardsHaveDefaultProject(orgId);
  if (isMongoConfigured()) {
    const db = await getDb();
    await ensureProjectIndexes(db);
    const doc = await db.collection<ProjectDoc>(COL_PROJECTS).findOne({ _id: projectId, orgId });
    return doc ? projectDocToData(doc) : null;
  }
  const store = await getStore();
  return (await store.get<ProjectData>(projectKey(orgId, projectId))) ?? null;
}

export async function createProject(orgId: string, input: Partial<ProjectData>): Promise<ProjectData> {
  const now = new Date().toISOString();
  const base = normalizeProjectInput({ ...input, orgId }, now);
  if (isMongoConfigured()) {
    const db = await getDb();
    await ensureProjectIndexes(db);
    const project: ProjectData = { id: await nextProjectIdMongo(db), ...base };
    await db.collection<ProjectDoc>(COL_PROJECTS).insertOne(projectDataToDoc(project));
    return project;
  }
  const store = await getStore();
  const project: ProjectData = { id: await nextProjectIdKv(), ...base };
  await store.set(projectKey(orgId, project.id), project);
  const ids = ((await store.get<string[]>(projectsIndexKey(orgId))) as string[]) || [];
  await store.set(projectsIndexKey(orgId), [project.id, ...ids.filter((id) => id !== project.id)]);
  return project;
}

export async function updateProject(
  orgId: string,
  projectId: string,
  updates: Partial<ProjectData>
): Promise<ProjectData | null> {
  const existing = await getProject(orgId, projectId);
  if (!existing) return null;
  const now = new Date().toISOString();
  const normalized = normalizeProjectInput({ ...existing, ...updates, id: projectId, orgId, createdAt: existing.createdAt }, now);
  const next: ProjectData = { id: projectId, ...normalized };
  if (isMongoConfigured()) {
    const db = await getDb();
    await ensureProjectIndexes(db);
    await db.collection<ProjectDoc>(COL_PROJECTS).replaceOne({ _id: projectId, orgId }, projectDataToDoc(next));
    return next;
  }
  const store = await getStore();
  await store.set(projectKey(orgId, projectId), next);
  return next;
}

export async function archiveProject(orgId: string, projectId: string): Promise<{ ok: boolean; reason?: string }> {
  const activeBoards = await countBoardsInProject(orgId, projectId);
  if (activeBoards > 0) {
    return { ok: false, reason: "Mova os boards ativos antes de arquivar este projeto." };
  }
  const archived = await updateProject(orgId, projectId, { status: "archived", archivedAt: new Date().toISOString() });
  return { ok: Boolean(archived) };
}
