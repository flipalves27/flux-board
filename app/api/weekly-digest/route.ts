import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { render } from "@react-email/render";
import React from "react";

import { isMongoConfigured, getDb } from "@/lib/mongo";
import { listUsers } from "@/lib/kv-users";
import { type Organization, ensureDefaultOrganization } from "@/lib/kv-organizations";
import { rateLimit } from "@/lib/rate-limit";
import { verifyCronSecret } from "@/lib/cron-secret";

import { WeeklyDigestEmail } from "@/emails/WeeklyDigestEmail";
import type { WeeklyDigestBoard, WeeklyDigestOverdueCard, WeeklyDigestOkrSection } from "@/emails/WeeklyDigestEmail";

import type { BoardData } from "@/lib/kv-boards";
import {
  computeOverdueCards,
  computeWeeklyToolMetricsFromCopilotChats,
} from "@/lib/weekly-digest-metrics";
import { generateBoardWeeklyDigestInsightAI } from "@/lib/weekly-digest-llm";
import { buildWeeklySentimentCorpus, generateBoardWeeklySentimentAI } from "@/lib/weekly-digest-sentiment-llm";
import {
  ensureBoardWeeklySentimentIndexes,
  getSentimentScoreForBoardWeek,
  upsertBoardWeeklySentiment,
} from "@/lib/board-weekly-sentiment";
import { generateOkrWeeklyDigestBlockAI } from "@/lib/okr-weekly-digest-llm";
import { loadOkrProjectionsForOrgQuarter } from "@/lib/okr-projection-org";
import { canUseFeature } from "@/lib/plan-gates";
import { isOrgCloudLlmConfigured } from "@/lib/org-ai-routing";
import { COL_ANOMALY_ALERTS } from "@/lib/anomaly-service";
import { resolvePlatformDisplayName } from "@/lib/org-branding";
import { buildResendFromForOrg } from "@/lib/org-branding-resend";

const DAY_MS = 24 * 60 * 60 * 1000;

type DigestUser = Awaited<ReturnType<typeof listUsers>>[number];

function formatDateRange(weekStartMs: number, weekEndMs: number, timeZone?: string): string {
  const tz = timeZone || process.env.DIGEST_TIMEZONE || "America/Sao_Paulo";
  const fmt = new Intl.DateTimeFormat("pt-BR", { timeZone: tz, day: "2-digit", month: "2-digit" });
  const a = fmt.format(new Date(weekStartMs));
  const b = fmt.format(new Date(weekEndMs - 1)); // "até" inclusivo (visual)
  return `${a} a ${b}`;
}

async function listBoardsForOrgMongo(orgId: string, db: any): Promise<BoardData[]> {
  const docs = await db.collection("boards").find({ orgId }).toArray();
  return docs
    .map((doc: any) => {
      const id = doc?._id;
      if (!id || !doc) return null;
      const { _id, ...rest } = doc;
      return { ...rest, id } as BoardData;
    })
    .filter(Boolean);
}

function currentQuarterLabel(): string {
  const now = new Date();
  const year = now.getFullYear();
  const q = Math.floor(now.getMonth() / 3) + 1;
  return `${year}-Q${q}`;
}

function pickManagers(
  users: DigestUser[],
  params: {
    orgOwnerId: string;
  }
): string[] {
  const { orgOwnerId } = params;

  // Regra solicitada: gestões/diretoria = somente o dono/criador da org.
  const emails = users
    .filter((u) => !!u?.email && u.id === orgOwnerId)
    .map((u) => u.email)
    .filter(Boolean);

  const override = process.env.DIGEST_RECIPIENT_OVERRIDE_EMAILS?.trim();
  if (override) {
    return override.split(",").map((s) => s.trim()).filter(Boolean);
  }

  return emails;
}

export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request, ["WEEKLY_DIGEST_SECRET", "CRON_MASTER_SECRET"])) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isMongoConfigured()) {
    return NextResponse.json(
      { error: "Digest semanal requer MongoDB (MONGODB_URI) habilitado." },
      { status: 501 }
    );
  }

  const resendApiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL;
  if (!resendApiKey || !fromEmail) {
    return NextResponse.json({ error: "RESEND_API_KEY e RESEND_FROM_EMAIL são obrigatórios." }, { status: 500 });
  }

  const baseAppUrl = process.env.NEXT_PUBLIC_APP_URL || "";
  if (!baseAppUrl) {
    // Não bloqueamos o digest; só evitamos links quebrados.
    console.warn("[weekly-digest] NEXT_PUBLIC_APP_URL não configurada. Usando '#'.");
  }

  const now = new Date();
  const weekEndMs = now.getTime();
  const weekStartMs = weekEndMs - 7 * DAY_MS;
  const prevStartMs = weekStartMs - 7 * DAY_MS;
  const weekLabel = formatDateRange(weekStartMs, weekEndMs);

  const db = await getDb();

  // Garante org default quando necessário (ex: ambientes de migração).
  await ensureDefaultOrganization("admin");

  const organizations = (await db.collection<Organization>("organizations").find({}).toArray()) as Organization[];
  const orgsToProcess = organizations.length ? organizations : [];

  const orgsLimit = Number(process.env.WEEKLY_DIGEST_MAX_ORGS ?? "");
  const limitedOrgs = Number.isFinite(orgsLimit) && orgsLimit > 0 ? orgsToProcess.slice(0, orgsLimit) : orgsToProcess;

  if (!limitedOrgs.length) {
    return NextResponse.json({ ok: true, skipped: "No organizations found." });
  }

  const resend = new Resend(resendApiKey);

  let totalEmailsSent = 0;
  let totalBoardsProcessed = 0;

  for (const org of limitedOrgs) {
    try {
      const orgId = org._id;
      const users = await listUsers(orgId);
      const recipients = pickManagers(users, { orgOwnerId: org.ownerId });
      if (!recipients.length) continue;

      // Deduplicação por org/semana (cron pode disparar duplicado em alguns cenários).
      const weekKey = new Date(weekStartMs).toISOString().slice(0, 10);
      const rlRun = await rateLimit({
        key: `weekly-digest:org:${orgId}:week:${weekKey}`,
        limit: 1,
        windowMs: 8 * DAY_MS,
      });
      if (!rlRun.allowed) continue;

      const boards = await listBoardsForOrgMongo(orgId, db);
      const boardIds = boards.map((b) => b.id).filter(Boolean);
      if (!boardIds.length) continue;

      let proactiveLines: string[] | null = null;
      if (canUseFeature(org, "portfolio_export")) {
        const since = new Date(weekStartMs).toISOString();
        const rows = await db
          .collection<{ message?: string }>(COL_ANOMALY_ALERTS)
          .find({ orgId, createdAt: { $gte: since } })
          .sort({ createdAt: -1 })
          .limit(8)
          .toArray();
        proactiveLines = rows.map((r) => String(r.message || "").trim()).filter(Boolean);
        if (proactiveLines.length === 0) proactiveLines = null;
      }

      const weekCurrent = { startMs: weekStartMs, endMs: weekEndMs };
      const weekPrevious = { startMs: prevStartMs, endMs: weekStartMs };

      await ensureBoardWeeklySentimentIndexes(db);

      // Buscamos chats atualizados desde o início da semana anterior.
      const prevStartIso = new Date(prevStartMs).toISOString();
      const copilotChats = await db
        .collection("board_copilot_chats")
        .find({ orgId, boardId: { $in: boardIds }, updatedAt: { $gte: prevStartIso } })
        .toArray();

      const toolMetricsByBoard = computeWeeklyToolMetricsFromCopilotChats({
        boardIds,
        copilotChats: copilotChats as any,
        currentRange: weekCurrent,
        previousRange: weekPrevious,
      });

      const llmCloudEnabled = isOrgCloudLlmConfigured(org);

      let okrSection: WeeklyDigestOkrSection | null = null;
      if (canUseFeature(org, "okr_engine")) {
        try {
          const quarter = currentQuarterLabel();
          const projections = await loadOkrProjectionsForOrgQuarter({
            orgId,
            quarter,
            boards,
          });
          if (projections.length) {
            const okrBlock = await generateOkrWeeklyDigestBlockAI({
              orgName: org.name,
              quarter,
              projections,
              allowAI: llmCloudEnabled,
              org,
              orgId,
            });
            const riskAlerts = projections
              .filter((p) => p.riskBelowThreshold)
              .map((p) => ({
                objectiveTitle: p.objectiveTitle,
                krTitle: p.krTitle,
                line: p.summaryLine.replace(/^⚠️\s*/, ""),
              }));
            okrSection = {
              quarter,
              headline: okrBlock.headline,
              bullets: okrBlock.bullets,
              riskAlerts,
            };
          }
        } catch (okrErr) {
          console.error("[weekly-digest] OKR section error:", org._id, okrErr);
        }
      }

      const boardsForEmail: WeeklyDigestBoard[] = [];

      for (let i = 0; i < boards.length; i++) {
        const board = boards[i];
        const boardId = board.id;
        if (!boardId) continue;

        const overdueCards = computeOverdueCards(board);
        const metrics = toolMetricsByBoard[boardId] ?? {
          createdCurrent: 0,
          movedCurrent: 0,
          concludedCurrent: 0,
          createdPrevious: 0,
          movedPrevious: 0,
          concludedPrevious: 0,
        };

        // Política: se algum LLM cloud estiver configurado, tentamos gerar insight IA
        // para cada board incluído no email (sem desviar para heurística por cap).
        const allowAI = llmCloudEnabled;

        const insightResult = await generateBoardWeeklyDigestInsightAI({
          board,
          boardName: board.name || "Board",
          metrics: {
            createdCurrent: metrics.createdCurrent,
            movedCurrent: metrics.movedCurrent,
            concludedCurrent: metrics.concludedCurrent,
            createdPrevious: metrics.createdPrevious,
            movedPrevious: metrics.movedPrevious,
            concludedPrevious: metrics.concludedPrevious,
          },
          overdueCards,
          allowAI,
          org,
          orgId,
        });

        const previousWeekSentimentScore = await getSentimentScoreForBoardWeek({
          db,
          orgId,
          boardId,
          weekStartMs: prevStartMs,
        });

        const { corpus: sentimentCorpus } = buildWeeklySentimentCorpus({
          board,
          boardId,
          weekRange: weekCurrent,
          copilotChats: copilotChats as any,
        });

        const sentimentResult = await generateBoardWeeklySentimentAI({
          boardName: board.name || "Board",
          corpus: sentimentCorpus,
          previousWeekScore: previousWeekSentimentScore,
          allowAI,
          org,
        });

        await upsertBoardWeeklySentiment({
          db,
          doc: {
            orgId,
            boardId,
            weekStartMs,
            weekStartIso: new Date(weekStartMs).toISOString().slice(0, 10),
            score: sentimentResult.score,
            category: sentimentResult.category,
            trend: sentimentResult.trend,
            trendDelta: sentimentResult.trendDelta,
          },
        });

        const emailOverdue: WeeklyDigestOverdueCard[] = overdueCards.slice(0, 5).map((c) => ({
          title: c.title,
          bucket: c.bucket,
          progress: c.progress,
          dueDate: c.dueDate,
          daysOverdue: c.daysOverdue,
          action: "",
        }));

        // Combina ações IA (quando retornadas) com a lista de overdue cards por título.
        if (insightResult.overdueActions?.length) {
          const map = new Map<string, string>();
          for (const oa of insightResult.overdueActions) {
            map.set(oa.title, oa.action);
          }
          for (const oc of emailOverdue) {
            oc.action = map.get(oc.title) || oc.action;
          }
        }

        // Fallback: se a ação IA não casou títulos, gera uma ação baseada no progresso.
        for (const oc of emailOverdue) {
          if (oc.action) continue;
          if (oc.progress === "Não iniciado") oc.action = "Defina o próximo passo e confirme critérios de passagem.";
          else if (oc.progress === "Em andamento") oc.action = "Identifique bloqueios e ajuste prioridades para destravar.";
          else oc.action = "Reavalie estratégia e alinhe o card com a coluna correta.";
        }

        const boardsForBoard: WeeklyDigestBoard = {
          boardName: board.name || "Board",
          created: metrics.createdCurrent,
          moved: metrics.movedCurrent,
          concluded: metrics.concludedCurrent,
          throughputCurrent: metrics.concludedCurrent,
          throughputPrevious: metrics.concludedPrevious,
          overdueCards: emailOverdue,
          insight: insightResult.insight,
          summary: insightResult.summary,
          teamMood: {
            emoji: sentimentResult.emoji,
            score: sentimentResult.score,
            trend: sentimentResult.trend,
            trendDelta: sentimentResult.trendDelta,
            previousScore: previousWeekSentimentScore,
            signalExamples: sentimentResult.signalExamples.slice(0, 3),
          },
        };

        boardsForEmail.push(boardsForBoard);
        totalBoardsProcessed++;
      }

      const platformLabel = resolvePlatformDisplayName(org.branding, org.name);
      const digestLogo =
        org.branding?.logoUrl && /^https?:\/\//i.test(org.branding.logoUrl) ? org.branding.logoUrl : undefined;

      const html = await render(
        React.createElement(WeeklyDigestEmail as any, {
          orgName: org.name,
          platformLabel,
          logoUrl: digestLogo,
          weekLabel,
          appUrl: baseAppUrl,
          boards: boardsForEmail,
          okrSection,
          proactiveLines,
        })
      );

      const moodLine = (b: WeeklyDigestBoard) => {
        const m = b.teamMood;
        if (!m) return "";
        const arrow = m.trend === "up" ? "↑" : m.trend === "down" ? "↓" : "→";
        const delta =
          m.trendDelta !== null
            ? `${m.trendDelta > 0 ? "+" : ""}${m.trendDelta} pts`
            : m.previousScore === null
              ? "sem baseline"
              : "estável";
        return `Clima do time: ${m.emoji} ${m.score}/100 (${arrow} ${delta} vs semana anterior)`;
      };

      const text = [
        `Weekly Digest IA - ${platformLabel}`,
        `Período: ${weekLabel}`,
        `Boards: ${boardsForEmail.length}`,
        okrSection
          ? `OKRs (${okrSection.quarter}): ${okrSection.headline} | alertas: ${okrSection.riskAlerts.length}`
          : "",
        ...boardsForEmail.flatMap((b) => [`--- ${b.boardName} ---`, moodLine(b)].filter(Boolean)),
      ]
        .filter(Boolean)
        .join("\n");

      const fromResolved = buildResendFromForOrg(org, fromEmail);

      for (const to of recipients) {
        try {
          await resend.emails.send({
            from: fromResolved,
            to,
            subject: `${platformLabel} Weekly Digest — ${weekLabel}`,
            html,
            text,
          });
        } catch (sendErr) {
          if (fromResolved !== fromEmail) {
            console.warn("[weekly-digest] Resend from org falhou, usando remetente padrão:", sendErr);
            await resend.emails.send({
              from: fromEmail,
              to,
              subject: `${platformLabel} Weekly Digest — ${weekLabel}`,
              html,
              text,
            });
          } else {
            throw sendErr;
          }
        }
        totalEmailsSent++;
      }
    } catch (err) {
      console.error("[weekly-digest] Error processing org:", org._id, err);
      // seguimos com as próximas orgs
    }
  }

  return NextResponse.json({ ok: true, totalEmailsSent, totalBoardsProcessed });
}

