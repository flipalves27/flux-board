import { render } from "@react-email/render";
import React from "react";
import type { Db, ObjectId } from "mongodb";
import { Resend } from "resend";

import { AnomalyAlertEmail } from "@/emails/AnomalyAlertEmail";
import { boardEmailGate, buildAnomalyNotifyDedupeKey } from "@/lib/anomaly-board-settings";
import { COL_ANOMALY_ALERTS } from "@/lib/anomaly-collections";
import type { AnomalyAlertPayload } from "@/lib/anomaly-detection";
import type { Organization } from "@/lib/kv-organizations";
import { resolvePlatformDisplayName } from "@/lib/org-branding";
import { buildResendFromForOrg } from "@/lib/org-branding-resend";
import type { BoardData } from "@/lib/kv-boards";
import { listUsers } from "@/lib/kv-users";
import { fallbackAnomalySuggestion, generateAnomalySuggestedAction } from "@/lib/anomaly-suggested-action";
import { recordAnomalyNotifySent, shouldSkipNotifyDueToDedupe } from "@/lib/anomaly-notify-dedupe";

const DEFAULT_LOCALE = "pt-BR";

function baseAppUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
  return String(raw || "").replace(/\/+$/, "");
}

function boardPath(boardId: string | undefined): string {
  const base = baseAppUrl() || "";
  const loc = process.env.NEXT_PUBLIC_DEFAULT_LOCALE || DEFAULT_LOCALE;
  if (!boardId) {
    return base ? `${base}/${loc}/boards` : "";
  }
  return base ? `${base}/${loc}/board/${encodeURIComponent(boardId)}` : "";
}

function uniqEmails(list: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const e of list) {
    const x = String(e || "").trim().toLowerCase();
    if (!x || !x.includes("@")) continue;
    if (seen.has(x)) continue;
    seen.add(x);
    out.push(String(e).trim());
  }
  return out.slice(0, 20);
}

function orgWideOverrideEmails(): string[] {
  const raw = process.env.ANOMALY_ORG_NOTIFY_EMAILS?.trim();
  if (!raw) return [];
  return uniqEmails(raw.split(/[\s,;]+/).filter(Boolean));
}

function globalOverrideEmails(): string[] {
  const raw = process.env.ANOMALY_NOTIFY_OVERRIDE_EMAILS?.trim();
  if (!raw) return [];
  return uniqEmails(raw.split(/[\s,;]+/).filter(Boolean));
}

function resolveRecipients(
  alert: AnomalyAlertPayload,
  board: BoardData | undefined,
  org: Organization | null,
  adminEmails: string[]
): string[] {
  const g = globalOverrideEmails();
  if (g.length) return g;

  const cfgExtra = board?.anomalyNotifications?.recipientEmails;
  if (Array.isArray(cfgExtra) && cfgExtra.length) {
    return uniqEmails(cfgExtra);
  }

  if (!alert.boardId) {
    const ow = orgWideOverrideEmails();
    if (ow.length) return ow;
  }

  const fromAdmins = uniqEmails(adminEmails);
  if (fromAdmins.length) return fromAdmins;

  const ownerId = org?.ownerId;
  return [];
}

export async function postPersistAnomalyNotifications(args: {
  db: Db;
  orgId: string;
  org: Organization | null;
  boards: BoardData[];
  alerts: AnomalyAlertPayload[];
  alertObjectIds: ObjectId[];
  nowMs: number;
}): Promise<void> {
  const { db, orgId, org, boards, alerts, alertObjectIds, nowMs } = args;
  if (!alerts.length || alerts.length !== alertObjectIds.length) return;

  const resendKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL;
  const resend = resendKey && fromEmail ? new Resend(resendKey) : null;

  const users = await listUsers(orgId);
  const adminEmails = users.filter((u) => u.isAdmin && u.email).map((u) => u.email);
  const ownerEmail = org?.ownerId ? users.find((u) => u.id === org.ownerId)?.email : undefined;
  const fallbackPool = uniqEmails([...(ownerEmail ? [ownerEmail] : []), ...adminEmails]);

  const boardById = new Map(boards.map((b) => [b.id, b]));

  for (let i = 0; i < alerts.length; i++) {
    const alert = alerts[i];
    const oid = alertObjectIds[i];
    if (!alert || !oid) continue;

    if (alert.severity !== "warning" && alert.severity !== "critical") {
      continue;
    }

    const dedupeKey = buildAnomalyNotifyDedupeKey(alert);
    const skipNotifyDedupe = await shouldSkipNotifyDueToDedupe(db, orgId, dedupeKey, nowMs);

    const { send, board } = boardEmailGate(alert, boardById);
    const targetBoard = alert.boardId ? boardById.get(alert.boardId) : undefined;
    const ctxBoard = targetBoard ?? board ?? null;

    const suggestedResult = skipNotifyDedupe
      ? { text: fallbackAnomalySuggestion(alert) }
      : await generateAnomalySuggestedAction({
          alert,
          board: ctxBoard,
        });
    const suggested = suggestedResult.text;

    const sentAt = new Date(nowMs).toISOString();
    const llmMeta =
      suggestedResult.llmModel != null && String(suggestedResult.llmModel).trim()
        ? {
            suggestedActionModel: String(suggestedResult.llmModel).trim(),
            suggestedActionProvider: String(suggestedResult.llmProvider || "together.ai").trim(),
          }
        : {};
    await db.collection(COL_ANOMALY_ALERTS).updateOne(
      { _id: oid },
      { $set: { suggestedAction: suggested, dedupeKey, suggestedActionAt: sentAt, ...llmMeta } }
    );

    if (!send || skipNotifyDedupe) {
      continue;
    }

    let recipients = resolveRecipients(alert, board ?? targetBoard, org, adminEmails);
    if (!recipients.length) {
      recipients = fallbackPool;
    }
    if (!recipients.length || !resend) {
      if (!resend) {
        console.warn("[anomaly-notify] RESEND_* ausente — alerta persistido sem e-mail.");
      }
      continue;
    }

    const url = boardPath(alert.boardId);
    const boardLine =
      alert.boardName && alert.boardId
        ? `${alert.boardName} (${alert.boardId})`
        : alert.boardName || (alert.boardId ? `Board ${alert.boardId}` : "Portfólio (org-wide)");

    const platformLabel = resolvePlatformDisplayName(org?.branding, org?.name);
    const anomalyLogo =
      org?.branding?.logoUrl && /^https?:\/\//i.test(org.branding.logoUrl) ? org.branding.logoUrl : undefined;

    const html = await render(
      React.createElement(AnomalyAlertEmail, {
        title: alert.title,
        boardLine,
        diagnosis: alert.message,
        suggestedAction: suggested,
        boardUrl: url || baseAppUrl() || "#",
        severity: alert.severity,
        platformLabel,
        logoUrl: anomalyLogo,
      })
    );

    const fromResolved = org ? buildResendFromForOrg(org, fromEmail!) : fromEmail!;

    try {
      await resend.emails.send({
        from: fromResolved,
        to: recipients,
        subject: `[${platformLabel}] ${alert.severity === "critical" ? "Crítico: " : ""}${alert.title}`,
        html,
      });
      await db.collection(COL_ANOMALY_ALERTS).updateOne({ _id: oid }, { $set: { emailSentAt: sentAt } });
      await recordAnomalyNotifySent(db, orgId, dedupeKey, sentAt);
    } catch (e) {
      if (fromResolved !== fromEmail) {
        try {
          await resend.emails.send({
            from: fromEmail!,
            to: recipients,
            subject: `[${platformLabel}] ${alert.severity === "critical" ? "Crítico: " : ""}${alert.title}`,
            html,
          });
          await db.collection(COL_ANOMALY_ALERTS).updateOne({ _id: oid }, { $set: { emailSentAt: sentAt } });
          await recordAnomalyNotifySent(db, orgId, dedupeKey, sentAt);
          continue;
        } catch (e2) {
          console.error("[anomaly-notify] Falha Resend (fallback)", e2);
        }
      }
      console.error("[anomaly-notify] Falha Resend", e);
    }
  }
}
