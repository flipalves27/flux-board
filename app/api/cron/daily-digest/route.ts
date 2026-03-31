import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { isMongoConfigured, getDb } from "@/lib/mongo";
import { listUsers } from "@/lib/kv-users";
import { verifyCronSecret } from "@/lib/cron-secret";
import type { BoardData } from "@/lib/kv-boards";
import { tryAcquireDailyDigestSend } from "@/lib/kv-daily-digest-lock";
import { buildResendFromForOrg } from "@/lib/org-branding-resend";
import type { Organization } from "@/lib/kv-organizations";
import { ensureDefaultOrganization } from "@/lib/kv-organizations";

export const runtime = "nodejs";

function dayKeyUtc(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

async function listBoardsForOrg(orgId: string): Promise<BoardData[]> {
  const db = await getDb();
  const docs = await db.collection("boards").find({ orgId }).toArray();
  return docs
    .map((doc: Record<string, unknown> & { _id?: unknown }) => {
      const id = doc?._id;
      if (!id || !doc) return null;
      const { _id, ...rest } = doc;
      return { ...rest, id: String(id) } as BoardData;
    })
    .filter(Boolean) as BoardData[];
}

function summarizeForUser(
  boards: BoardData[],
  userId: string
): { active: number; overdue: number; blocked: number; lines: string[] } {
  let active = 0;
  let overdue = 0;
  let blocked = 0;
  const lines: string[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (const b of boards) {
    const cards = Array.isArray(b.cards) ? b.cards : [];
    for (const c of cards) {
      const rec = c as Record<string, unknown>;
      const assignee = String(rec.assigneeId || rec.assignee || "").trim();
      if (assignee !== userId) continue;
      const prog = String(rec.progress || "");
      if (["Concluída", "Done", "Closed", "Cancelada"].includes(prog)) continue;
      active++;
      const due = rec.dueDate ? new Date(String(rec.dueDate).slice(0, 10) + "T12:00:00") : null;
      if (due && !Number.isNaN(due.getTime()) && due < today) overdue++;
      const tags = Array.isArray(rec.tags) ? (rec.tags as string[]) : [];
      if (tags.some((t) => /bloque|block/i.test(t))) blocked++;
      if (lines.length < 12) {
        lines.push(`- ${String(rec.title || "").slice(0, 80)} (${b.name || b.id})`);
      }
    }
  }
  return { active, overdue, blocked, lines };
}

export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request, ["DAILY_DIGEST_SECRET", "WEEKLY_DIGEST_SECRET", "CRON_MASTER_SECRET"])) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isMongoConfigured()) {
    return NextResponse.json({ error: "MongoDB obrigatório" }, { status: 501 });
  }

  const resendKey = process.env.RESEND_API_KEY;
  const fromDefault = process.env.RESEND_FROM_EMAIL;
  if (!resendKey || !fromDefault) {
    return NextResponse.json({ error: "RESEND não configurado" }, { status: 500 });
  }

  const resend = new Resend(resendKey);
  const day = dayKeyUtc();
  const db = await getDb();
  await ensureDefaultOrganization("admin");
  const orgs = (await db.collection<Organization>("organizations").find({}).toArray()) as Organization[];

  let sent = 0;
  let skipped = 0;

  for (const org of orgs) {
    const orgId = org._id;
    if (!orgId) continue;
    const boards = await listBoardsForOrg(orgId);
    const users = await listUsers(orgId);

    for (const u of users) {
      if (!u.email?.trim()) continue;
      const summary = summarizeForUser(boards, u.id);
      if (summary.active === 0) {
        skipped++;
        continue;
      }

      const acquired = await tryAcquireDailyDigestSend({ orgId, userId: u.id, dayKey: day });
      if (!acquired) {
        skipped++;
        continue;
      }

      const from = buildResendFromForOrg(org, fromDefault);
      const subject = `Flux-Board — resumo diário (${day})`;
      const body = [
        `Olá${u.name ? `, ${u.name}` : ""}.`,
        "",
        `Cards ativos atribuídos a você: ${summary.active}`,
        `Atrasados: ${summary.overdue}`,
        `Com indício de bloqueio (tag): ${summary.blocked}`,
        "",
        summary.lines.length ? "Amostra:" : "",
        ...summary.lines,
        "",
        "Abra o Flux-Board para atualizar status e dependências.",
      ]
        .filter(Boolean)
        .join("\n");

      const { error } = await resend.emails.send({
        from,
        to: u.email.trim(),
        subject,
        text: body,
      });
      if (error) {
        console.error("[daily-digest] resend", error);
        skipped++;
      } else {
        sent++;
      }
    }
  }

  return NextResponse.json({ ok: true, day, sent, skipped });
}
