import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { getBoard, updateBoard, deleteBoard, userCanAccessBoard, userCanAccessExistingBoard } from "@/lib/kv-boards";
import { BoardUpdateSchema, sanitizeDeep, zodErrorToMessage } from "@/lib/schemas";
import {
  expandBucketsWithInferredTransitionAliases,
  mergeBucketOrdersForWipResolve,
} from "@/lib/board-bucket-resolve";
import { publicApiErrorResponse } from "@/lib/public-api-error";
import { validateBoardWip, validateBoardWipPutTransition, type WipCountCardLike } from "@/lib/board-wip";
import { runSyncAutomationsOnBoardPut } from "@/lib/automation-engine";
import { stripPortalForClient, applyPortalPatch, type PortalBoardPatch } from "@/lib/portal-settings";
import { validateDodOnBoardPut } from "@/lib/board-scrum";
import type { BucketConfig } from "@/app/board/[id]/page";
import { inferLegacyBoardMethodology, type BoardMethodology } from "@/lib/board-methodology";
import { listSprints, getActiveSprint } from "@/lib/kv-sprints";
import { logFluxApiPhase } from "@/lib/flux-api-phase-log";

export const maxDuration = 60;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const route = "GET /api/boards/[id]";
  const t0 = Date.now();
  const payload = await getAuthFromRequest(request);
  logFluxApiPhase(route, "getAuthFromRequest", t0);
  if (!payload) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { id: requestedBoardId } = await params;
  if (!requestedBoardId || requestedBoardId === "boards") {
    return NextResponse.json({ error: "ID do board é obrigatório" }, { status: 400 });
  }
  const boardId = requestedBoardId;

  const t1 = Date.now();
  const board = await getBoard(boardId, payload.orgId);
  logFluxApiPhase(route, "getBoard", t1);
  if (!board) {
    return NextResponse.json({ error: "Sem permissão para este board" }, { status: 403 });
  }
  const t2 = Date.now();
  const allowed = await userCanAccessExistingBoard(board, payload.id, payload.orgId, payload.isAdmin);
  logFluxApiPhase(route, "userCanAccessExistingBoard", t2);
  if (!allowed) {
    return NextResponse.json({ error: "Sem permissão para este board" }, { status: 403 });
  }

  try {
    let boardMethodology: BoardMethodology = board.boardMethodology ?? "scrum";
    let inferredMethodology = false;
    if (!board.boardMethodology) {
      const sprints = await listSprints(payload.orgId, boardId);
      boardMethodology = inferLegacyBoardMethodology(sprints.length > 0);
      inferredMethodology = true;
    }
    if (inferredMethodology) {
      await updateBoard(
        boardId,
        payload.orgId,
        { boardMethodology },
        { userId: payload.id, userName: payload.username, orgId: payload.orgId }
      );
    }
    const safe = {
      ...board,
      boardMethodology,
      portal: stripPortalForClient(board.portal),
    };
    logFluxApiPhase(route, "total", t0);
    return NextResponse.json(safe);
  } catch (err) {
    console.error("Board API error:", err);
    return publicApiErrorResponse(err, { context: "api/boards/[id]/route.ts" });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const payload = await getAuthFromRequest(request);
  if (!payload) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { id: requestedBoardId } = await params;
  if (!requestedBoardId || requestedBoardId === "boards") {
    return NextResponse.json({ error: "ID do board é obrigatório" }, { status: 400 });
  }
  const boardId = requestedBoardId;

  const canAccess = await userCanAccessBoard(payload.id, payload.orgId, payload.isAdmin, boardId);
  if (!canAccess) {
    return NextResponse.json({ error: "Sem permissão para este board" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const parsed = BoardUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: zodErrorToMessage(parsed.error) }, { status: 400 });
    }

    // Sanitiza strings aninhadas vindas do cliente (ex.: titulo/desc em cards, tags, etc.)
    const clean = sanitizeDeep(parsed.data);
    const wipOverrideReason =
      typeof (clean as { wipOverrideReason?: string }).wipOverrideReason === "string"
        ? (clean as { wipOverrideReason: string }).wipOverrideReason.trim()
        : "";
    delete (clean as { wipOverrideReason?: string }).wipOverrideReason;

    const updates: Record<string, unknown> = {};
    if (clean.name !== undefined) {
      updates.name = String(clean.name || "").trim().slice(0, 100);
    }
    if (clean.cards !== undefined) {
      const prevBoard = await getBoard(boardId, payload.orgId);
      if (!prevBoard) {
        return NextResponse.json({ error: "Board não encontrado" }, { status: 404 });
      }
      const prevCfg = (prevBoard.config || {}) as Record<string, unknown>;
      const patchCfg = (clean.config || {}) as Record<string, unknown>;
      const mergedBucketOrder = (patchCfg.bucketOrder as unknown[] | undefined) ?? (prevCfg.bucketOrder as unknown[] | undefined) ?? [];
      const mergedDef =
        patchCfg.definitionOfDone === null
          ? undefined
          : patchCfg.definitionOfDone !== undefined
            ? patchCfg.definitionOfDone
            : prevCfg.definitionOfDone;
      const dodGate = validateDodOnBoardPut({
        prevCards: (prevBoard.cards || []) as unknown[],
        nextCards: clean.cards as unknown[],
        bucketOrder: mergedBucketOrder as BucketConfig[],
        definitionOfDone: mergedDef as import("@/app/board/[id]/page").BoardDefinitionOfDone | undefined,
      });
      if (!dodGate.ok) {
        return NextResponse.json({ error: dodGate.message }, { status: 400 });
      }
      const { cards } = await runSyncAutomationsOnBoardPut({
        prevBoard,
        nextCards: clean.cards as unknown[],
        boardId,
        orgId: payload.orgId,
        boardName: prevBoard.name,
      });
      const prevBucketOrder =
        (prevBoard.config as { bucketOrder?: { key: string; label?: string; wipLimit?: number | null }[] } | undefined)
          ?.bucketOrder ?? [];
      const cleanBucketOrder = clean.config?.bucketOrder ?? [];
      const mergedBuckets = mergeBucketOrdersForWipResolve(
        prevBucketOrder,
        cleanBucketOrder.length > 0 ? cleanBucketOrder : prevBucketOrder
      );
      const wipBuckets = expandBucketsWithInferredTransitionAliases(
        mergedBuckets,
        (prevBoard.cards || []) as { id?: string; bucket?: string }[],
        cards as { id?: string; bucket?: string }[]
      );
      const mergedCfg = { ...(prevBoard.config as Record<string, unknown>), ...(clean.config as Record<string, unknown> | undefined) };
      const wipMode = mergedCfg.wipEnforcement === "soft" ? "soft" : "strict";
      if (wipMode === "strict") {
        const wipCheck = validateBoardWipPutTransition(
          wipBuckets,
          (prevBoard.cards || []) as WipCountCardLike[],
          cards as WipCountCardLike[]
        );
        if (!wipCheck.ok) {
          if (wipOverrideReason.length >= 8) {
            // ultrapassagem explícita com justificativa — aceita o PUT
          } else {
            return NextResponse.json({ error: wipCheck.message }, { status: 400 });
          }
        }
      }
      const requireAssignee =
        Boolean((clean.config as { cardRules?: { requireAssignee?: boolean } } | undefined)?.cardRules?.requireAssignee) ||
        Boolean((prevBoard.config as { cardRules?: { requireAssignee?: boolean } } | undefined)?.cardRules?.requireAssignee);
      if (requireAssignee) {
        const missing = (cards as Array<{ assigneeId?: string | null }>).find(
          (c) => !String(c.assigneeId ?? "").trim()
        );
        if (missing) {
          return NextResponse.json({ error: "Este board exige responsável em todos os cards." }, { status: 400 });
        }
      }
      updates.cards = cards;
    }
    if (clean.config !== undefined) {
      const prevForWip = await getBoard(boardId, payload.orgId);
      const nextWipMode =
        (clean.config as { wipEnforcement?: string }).wipEnforcement === "soft"
          ? "soft"
          : (prevForWip?.config as { wipEnforcement?: string } | undefined)?.wipEnforcement === "soft"
            ? "soft"
            : "strict";
      if (prevForWip?.cards?.length && clean.config.bucketOrder?.length && nextWipMode !== "soft") {
        const prevCfgBo =
          (prevForWip.config as { bucketOrder?: { key: string; label?: string; wipLimit?: number | null }[] } | undefined)
            ?.bucketOrder ?? [];
        const mergedCfgBuckets = mergeBucketOrdersForWipResolve(prevCfgBo, clean.config.bucketOrder);
        const wipOnlyConfig = validateBoardWip(mergedCfgBuckets, prevForWip.cards as WipCountCardLike[]);
        if (!wipOnlyConfig.ok) {
          return NextResponse.json({ error: wipOnlyConfig.message }, { status: 400 });
        }
      }
      if (clean.config.cardRules?.requireAssignee) {
        const hasMissingAssignee = (prevForWip?.cards ?? []).some(
          (card) => !String((card as { assigneeId?: string | null }).assigneeId ?? "").trim()
        );
        if (hasMissingAssignee) {
          return NextResponse.json(
            { error: "Existem cards sem responsável. Preencha antes de ativar esta regra." },
            { status: 400 }
          );
        }
      }
      updates.config = clean.config;
    }
    if (clean.mapaProducao !== undefined) updates.mapaProducao = clean.mapaProducao;
    if (clean.dailyInsights !== undefined) updates.dailyInsights = clean.dailyInsights;
    if (clean.version !== undefined) updates.version = clean.version;
    if (clean.lastUpdated !== undefined) updates.lastUpdated = clean.lastUpdated;
    if (clean.clientLabel !== undefined) {
      updates.clientLabel = String(clean.clientLabel ?? "").trim().slice(0, 120);
    }

    if (clean.boardMethodology !== undefined) {
      const prevBoard = await getBoard(boardId, payload.orgId);
      if (!prevBoard) {
        return NextResponse.json({ error: "Board não encontrado" }, { status: 404 });
      }
      let prevEffective: BoardMethodology = prevBoard.boardMethodology ?? "scrum";
      if (!prevBoard.boardMethodology) {
        const sprints = await listSprints(payload.orgId, boardId);
        prevEffective = inferLegacyBoardMethodology(sprints.length > 0);
      }
      if (
        (clean.boardMethodology === "kanban" || clean.boardMethodology === "lean_six_sigma") &&
        prevEffective === "scrum"
      ) {
        const active = await getActiveSprint(payload.orgId, boardId);
        if (active) {
          return NextResponse.json(
            {
              error:
                "Não é possível mudar de Scrum com sprint ativo. Encerre ou feche o sprint antes, ou escolha outro board.",
            },
            { status: 400 }
          );
        }
      }
      updates.boardMethodology = clean.boardMethodology;
    }

    if (clean.portal !== undefined) {
      const prevBoard = await getBoard(boardId, payload.orgId);
      if (!prevBoard) {
        return NextResponse.json({ error: "Board não encontrado" }, { status: 404 });
      }
      const portalPatch = sanitizeDeep(clean.portal) as PortalBoardPatch;
      const { portal: nextPortal } = await applyPortalPatch(prevBoard, portalPatch);
      updates.portal = nextPortal;
    }

    if (clean.anomalyNotifications !== undefined) {
      if (clean.anomalyNotifications === null) {
        updates.anomalyNotifications = undefined;
      } else {
        updates.anomalyNotifications = clean.anomalyNotifications;
      }
    }

    const board = await updateBoard(boardId, payload.orgId, updates, {
      userId: payload.id,
      userName: payload.username,
      orgId: payload.orgId,
    });
    if (!board) {
      return NextResponse.json({ error: "Board não encontrado" }, { status: 404 });
    }
    return NextResponse.json({
      ok: true,
      lastUpdated: board.lastUpdated,
      cardsCount: (board.cards || []).length,
      ...(clean.cards !== undefined ? { cards: board.cards } : {}),
      ...(clean.portal !== undefined ? { portal: stripPortalForClient(board.portal) } : {}),
    });
  } catch (err) {
    console.error("Board API error:", err);
    return publicApiErrorResponse(err, { context: "api/boards/[id]/route.ts" });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const payload = await getAuthFromRequest(request);
  if (!payload) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { id: requestedBoardId } = await params;
  if (!requestedBoardId || requestedBoardId === "boards") {
    return NextResponse.json({ error: "ID do board é obrigatório" }, { status: 400 });
  }
  const boardId = requestedBoardId;

  try {
    const ok = await deleteBoard(boardId, payload.orgId, payload.id, payload.isAdmin);
    if (!ok) {
      return NextResponse.json({ error: "Board não encontrado" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Board API error:", err);
    return publicApiErrorResponse(err, { context: "api/boards/[id]/route.ts" });
  }
}
