import { after } from "next/server";
import { NextRequest, NextResponse } from "next/server";
import { canUseFeature } from "@/lib/plan-gates";
import { ensureSpecPlanAccess } from "@/lib/spec-plan-access";
import { executeSpecPlanRunInBackground } from "@/lib/spec-plan-background-run";
import { parseSpecPlanFormData } from "@/lib/spec-plan-form-parse";
import { createInitialSpecPlanRunState } from "@/lib/spec-plan-run-accumulator";
import { serializeSpecPlanRunSummary } from "@/lib/spec-plan-run-serialize";
import { isMongoConfigured } from "@/lib/mongo";
import { insertSpecPlanRun, listSpecPlanRuns, userHasActiveSpecPlanRunOnBoard } from "@/lib/spec-plan-runs";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: boardId } = await params;
  const access = await ensureSpecPlanAccess(request, boardId);
  if (access instanceof Response) return access;

  if (!isMongoConfigured()) {
    return NextResponse.json({ runs: [], persistence: false });
  }

  const runs = await listSpecPlanRuns({
    orgId: access.payload.orgId,
    boardId,
    userId: access.payload.id,
    limit: 50,
  });
  return NextResponse.json({
    runs: runs.map(serializeSpecPlanRunSummary),
    persistence: true,
  });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: boardId } = await params;
  const access = await ensureSpecPlanAccess(request, boardId, { consumeAnalysisQuota: true });
  if (access instanceof Response) return access;

  if (!isMongoConfigured()) {
    return NextResponse.json(
      { error: "Histórico e análise em segundo plano não estão disponíveis neste ambiente." },
      { status: 503 }
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch (e) {
    console.error("[spec-plan/runs] formData", e);
    return NextResponse.json(
      { error: "Não foi possível ler o formulário.", errorCode: "FORM_DATA_INVALID" },
      { status: 400 }
    );
  }

  const parsed = await parseSpecPlanFormData(formData);
  if (parsed instanceof Response) {
    const text = await parsed.text();
    return new NextResponse(text, { status: parsed.status, headers: { "Content-Type": "application/json" } });
  }

  const forceRaw = formData.get("force");
  const force = forceRaw === "1" || forceRaw === "true";
  if (!force) {
    const busy = await userHasActiveSpecPlanRunOnBoard(access.payload.orgId, access.payload.id, boardId);
    if (busy) {
      return NextResponse.json(
        {
          error: "Já existe uma análise em curso neste board.",
          errorCode: "SPEC_PLAN_RUN_IN_PROGRESS",
        },
        { status: 409 }
      );
    }
  }

  const { methodology, remapOnly, documentText, extractMeta, workItemsJson } = parsed;
  const allowSubtasks = canUseFeature(access.org, "subtasks", access.gateCtx);

  const sourceSummary = remapOnly
    ? "Remapeamento de colunas"
    : extractMeta.fileName || "Documento";

  const init = createInitialSpecPlanRunState(remapOnly);
  const insertedId = await insertSpecPlanRun({
    orgId: access.payload.orgId,
    boardId,
    userId: access.payload.id,
    status: "running",
    methodology,
    remapOnly,
    sourceSummary,
    phases: init.phases,
    logs: init.logs,
    docReadMeta: init.docReadMeta,
    outlineSummary: init.outlineSummary,
    methodologySummary: init.methodologySummary,
    workItemsPayload: init.workItemsPayload,
    preview: init.preview,
    streamError: init.streamError,
    streamErrorDetail: init.streamErrorDetail,
  });

  if (!insertedId) {
    return NextResponse.json({ error: "Não foi possível criar execução." }, { status: 500 });
  }

  const runIdHex = insertedId.toHexString();

  after(async () => {
    await executeSpecPlanRunInBackground({
      runId: insertedId,
      orgId: access.payload.orgId,
      boardId,
      payload: access.payload,
      org: access.org,
      board: access.board,
      methodology,
      remapOnly,
      documentText,
      extractMeta,
      workItemsJson,
      allowSubtasks,
    });
  });

  return NextResponse.json(
    { runId: runIdHex, message: "Análise iniciada em segundo plano." },
    { status: 202 }
  );
}
