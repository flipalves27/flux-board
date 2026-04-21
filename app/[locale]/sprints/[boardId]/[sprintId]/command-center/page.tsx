"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { Header } from "@/components/header";
import { useAuth } from "@/context/auth-context";
import { apiGet, ApiError } from "@/lib/api-client";
import type { ReleaseData, SprintData } from "@/lib/schemas";
import type { SprintOverviewPayload } from "@/lib/sprint-overview";
import { SprintCommandCenter } from "@/components/sprints/sprint-command-center";
import { SprintHistoryTimeline } from "@/components/sprints/sprint-history-timeline";
import { FluxEmptyState } from "@/components/ui/flux-empty-state";

type BoardPayload = { board?: { id: string; name?: string } };

export default function SprintCommandCenterPage() {
  const params = useParams();
  const { user, getHeaders, isChecked } = useAuth();
  const locale = useLocale();
  const localeRoot = `/${locale}`;
  const t = useTranslations("sprints.commandCenter");

  const boardId = Array.isArray(params.boardId) ? params.boardId[0] ?? "" : (params.boardId as string);
  const sprintId = Array.isArray(params.sprintId) ? params.sprintId[0] ?? "" : (params.sprintId as string);

  const [overview, setOverview] = useState<SprintOverviewPayload | null>(null);
  const [boardName, setBoardName] = useState<string>("");
  const [allSprints, setAllSprints] = useState<SprintData[]>([]);
  const [releases, setReleases] = useState<ReleaseData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ov, boardData, sprintData, relData] = await Promise.all([
        apiGet<SprintOverviewPayload>(
          `/api/boards/${encodeURIComponent(boardId)}/sprints/${encodeURIComponent(sprintId)}/overview`,
          getHeaders()
        ),
        apiGet<BoardPayload>(`/api/boards/${encodeURIComponent(boardId)}`, getHeaders()).catch(
          () => ({}) as BoardPayload
        ),
        apiGet<{ sprints: SprintData[] }>(
          `/api/boards/${encodeURIComponent(boardId)}/sprints`,
          getHeaders()
        ).catch(() => ({ sprints: [] as SprintData[] })),
        apiGet<{ releases: ReleaseData[] }>(
          `/api/boards/${encodeURIComponent(boardId)}/releases`,
          getHeaders()
        ).catch(() => ({ releases: [] as ReleaseData[] })),
      ]);
      setOverview(ov);
      setBoardName(boardData.board?.name ?? "");
      setAllSprints(sprintData.sprints ?? []);
      setReleases(relData.releases ?? []);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setError("notfound");
      else if (e instanceof ApiError && (e.status === 402 || e.status === 403)) setError("upgrade");
      else setError("load");
    } finally {
      setLoading(false);
    }
  }, [boardId, sprintId, getHeaders]);

  useEffect(() => {
    if (!user || !boardId || !sprintId) return;
    void load();
  }, [user, boardId, sprintId, load]);

  if (!isChecked || !user) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center px-4 text-sm text-[var(--flux-text-muted)]">
        …
      </div>
    );
  }

  const linkedRelease = releases.find((r) => r.sprintIds.includes(sprintId)) ?? null;
  const burndown = (overview?.burndown?.days ?? []).map((d) => ({
    date: d.date,
    ideal: d.ideal,
    actual: d.actual,
  }));

  return (
    <>
      <Header />
      <main className="mx-auto max-w-6xl px-4 py-8 space-y-8">
        <nav className="flex items-center gap-2 text-xs text-[var(--flux-text-muted)]">
          <Link href={`${localeRoot}/sprints`} className="hover:underline">
            {t("breadcrumb.sprints")}
          </Link>
          <span aria-hidden>·</span>
          <Link
            href={`${localeRoot}/sprints/${encodeURIComponent(boardId)}/${encodeURIComponent(sprintId)}`}
            className="hover:underline"
          >
            {t("breadcrumb.detail")}
          </Link>
          <span aria-hidden>·</span>
          <span className="text-[var(--flux-text)]">{t("breadcrumb.commandCenter")}</span>
        </nav>

        {loading ? (
          <p className="text-sm text-[var(--flux-text-muted)]">{t("loading")}</p>
        ) : error ? (
          <FluxEmptyState title={t("errorTitle")} description={t(`error.${error}`)} variant="search" />
        ) : overview?.sprint ? (
          <>
            <SprintCommandCenter
              sprint={overview.sprint}
              boardName={boardName}
              release={linkedRelease}
              burndown={burndown}
            />
            <SprintHistoryTimeline
              boardId={boardId}
              boardName={boardName}
              sprints={allSprints}
              releases={releases}
            />
          </>
        ) : (
          <FluxEmptyState title={t("errorTitle")} description={t("error.notfound")} variant="search" />
        )}
      </main>
    </>
  );
}
