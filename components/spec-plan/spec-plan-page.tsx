"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Header } from "@/components/header";
import { useAuth } from "@/context/auth-context";
import { apiGet, apiPost, ApiError } from "@/lib/api-client";

type PhaseState = "pending" | "running" | "done" | "error";

type BucketOpt = { key: string; label: string };

type PreviewRow = {
  title: string;
  desc: string;
  bucketKey: string;
  priority: string;
  progress: string;
  tags: string[];
  rationale: string;
  blockedByTitles: string[];
  subtasks: { title: string }[];
  storyPoints: number | null;
  serviceClass: string | null;
};

function parseSseBlocks(buffer: string): { rest: string; events: { event: string; data: string }[] } {
  const events: { event: string; data: string }[] = [];
  let rest = buffer;
  let idx: number;
  while ((idx = rest.indexOf("\n\n")) >= 0) {
    const block = rest.slice(0, idx);
    rest = rest.slice(idx + 2);
    let ev = "message";
    const dataLines: string[] = [];
    for (const line of block.split("\n")) {
      if (line.startsWith("event:")) ev = line.slice(6).trim();
      else if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
    }
    events.push({ event: ev, data: dataLines.join("\n") });
  }
  return { rest, events };
}

export default function SpecPlanPage() {
  const router = useRouter();
  const locale = useLocale();
  const localeRoot = `/${locale}`;
  const t = useTranslations("specPlanPage");
  const { user, getHeaders, isChecked } = useAuth();

  const [featureOk, setFeatureOk] = useState<boolean | null>(null);
  const [boards, setBoards] = useState<{ id: string; name: string }[]>([]);
  const [boardsErr, setBoardsErr] = useState<string | null>(null);
  const [boardId, setBoardId] = useState("");
  const [buckets, setBuckets] = useState<BucketOpt[]>([]);

  const [methodology, setMethodology] = useState<"scrum" | "kanban" | "lss">("scrum");
  const [file, setFile] = useState<File | null>(null);
  const [pasted, setPasted] = useState("");

  const [phaseParse, setPhaseParse] = useState<PhaseState>("pending");
  const [phaseOutline, setPhaseOutline] = useState<PhaseState>("pending");
  const [phaseWork, setPhaseWork] = useState<PhaseState>("pending");
  const [phaseCards, setPhaseCards] = useState<PhaseState>("pending");

  const [streamError, setStreamError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewRow[]>([]);
  const [workItemsPayload, setWorkItemsPayload] = useState<string>("");
  const [outlineSummary, setOutlineSummary] = useState<string | null>(null);
  const [methodologySummary, setMethodologySummary] = useState<string | null>(null);
  const [accept, setAccept] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applyMsg, setApplyMsg] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  useEffect(() => {
    if (!isChecked) return;
    if (!user) {
      router.replace(`${localeRoot}/login`);
    }
  }, [isChecked, user, router, localeRoot]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!isChecked || !user?.orgId) return;
      try {
        const f = await apiGet<{ spec_ai_scope_planner?: boolean }>("/api/org/features", getHeaders());
        if (!cancelled) setFeatureOk(Boolean(f?.spec_ai_scope_planner));
      } catch {
        if (!cancelled) setFeatureOk(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isChecked, user?.orgId, getHeaders]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!isChecked || !user?.orgId || !featureOk) return;
      try {
        const data = await apiGet<{ boards: { id: string; name: string }[] }>("/api/boards", getHeaders());
        if (!cancelled) setBoards(Array.isArray(data.boards) ? data.boards : []);
      } catch (e) {
        if (!cancelled) {
          setBoardsErr(e instanceof ApiError ? e.message : t("loadBoardsError"));
          setBoards([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isChecked, user?.orgId, featureOk, getHeaders, t]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!boardId || !featureOk) {
        setBuckets([]);
        return;
      }
      try {
        const b = await apiGet<{ config?: { bucketOrder?: { key?: string; label?: string }[] } }>(
          `/api/boards/${encodeURIComponent(boardId)}`,
          getHeaders()
        );
        const order = Array.isArray(b.config?.bucketOrder) ? b.config.bucketOrder : [];
        const opts = order
          .map((x) => ({ key: String(x.key || "").trim(), label: String(x.label || "").trim() }))
          .filter((x) => x.key);
        if (!cancelled) setBuckets(opts);
      } catch {
        if (!cancelled) setBuckets([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [boardId, featureOk, getHeaders]);

  const resetPhases = useCallback(() => {
    setPhaseParse("pending");
    setPhaseOutline("pending");
    setPhaseWork("pending");
    setPhaseCards("pending");
    setStreamError(null);
    setOutlineSummary(null);
    setMethodologySummary(null);
  }, []);

  const runStream = useCallback(
    async (opts: { remapOnly: boolean }) => {
      if (!boardId) return;
      setAnalyzing(true);
      setStreamError(null);
      resetPhases();
      setPreview([]);
      setApplyMsg(null);
      if (!opts.remapOnly) {
        setPhaseParse("running");
      } else {
        setPhaseParse("done");
        setPhaseOutline("done");
        setPhaseWork("done");
        setPhaseCards("running");
      }

      const form = new FormData();
      form.set("methodology", methodology);
      form.set("remapOnly", opts.remapOnly ? "1" : "0");
      if (opts.remapOnly) {
        form.set("workItemsJson", workItemsPayload);
      } else {
        if (pasted) form.set("pastedText", pasted);
        if (file) form.set("file", file, file.name);
      }

      const res = await fetch(`/api/boards/${encodeURIComponent(boardId)}/spec-plan/stream`, {
        method: "POST",
        headers: {
          Accept: "text/event-stream",
          ...getHeaders(),
        },
        body: form,
      });

      if (!res.ok) {
        const errText = await res.text();
        let msg = t("streamError");
        try {
          const j = JSON.parse(errText) as { error?: string };
          if (j.error) msg = j.error;
        } catch {
          /* ignore */
        }
        setStreamError(msg);
        setAnalyzing(false);
        setPhaseParse("error");
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        setStreamError(t("streamError"));
        setAnalyzing(false);
        return;
      }

      const dec = new TextDecoder();
      let buf = "";
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const { rest, events } = parseSseBlocks(buf);
          buf = rest;
          for (const { event, data } of events) {
            let payload: Record<string, unknown> = {};
            try {
              payload = JSON.parse(data) as Record<string, unknown>;
            } catch {
              payload = {};
            }
            if (event === "document_parsed") {
              setPhaseParse("done");
              setPhaseOutline("running");
            } else if (event === "outline_ready") {
              setPhaseOutline("done");
              setPhaseWork("running");
              const sections = payload.sections as unknown[];
              const kr = payload.keyRequirements as unknown[];
              setOutlineSummary(
                t("outlineStats", {
                  sections: Array.isArray(sections) ? sections.length : 0,
                  requirements: Array.isArray(kr) ? kr.length : 0,
                })
              );
            } else if (event === "work_items_draft") {
              setPhaseWork("done");
              setWorkItemsPayload(JSON.stringify(payload));
            } else if (event === "methodology_applied") {
              const s = payload.summary;
              if (typeof s === "string") setMethodologySummary(s.slice(0, 800));
            } else if (event === "bucket_mapping") {
              setPhaseCards("running");
            } else if (event === "cards_preview") {
              setPhaseCards("done");
              const rows = payload.cardRows as Record<string, unknown>[] | undefined;
              const list: PreviewRow[] = [];
              if (Array.isArray(rows)) {
                for (const r of rows) {
                  list.push({
                    title: String(r.title || "").slice(0, 300),
                    desc: String(r.desc || "").slice(0, 6000),
                    bucketKey: String(r.bucketKey || ""),
                    priority: String(r.priority || "Média"),
                    progress: String(r.progress || "Não iniciado"),
                    tags: Array.isArray(r.tags) ? r.tags.map((x) => String(x)).filter(Boolean).slice(0, 30) : [],
                    rationale: String(r.rationale || ""),
                    blockedByTitles: Array.isArray(r.blockedByTitles)
                      ? r.blockedByTitles.map((x) => String(x)).filter(Boolean)
                      : [],
                    subtasks: Array.isArray(r.subtasks)
                      ? r.subtasks
                          .map((s) => ({ title: String((s as { title?: string }).title || "").slice(0, 300) }))
                          .filter((s) => s.title)
                          .slice(0, 12)
                      : [],
                    storyPoints: typeof r.storyPoints === "number" ? r.storyPoints : null,
                    serviceClass: typeof r.serviceClass === "string" ? r.serviceClass : null,
                  });
                }
              }
              setPreview(list);
            } else if (event === "error") {
              const msg = typeof payload.message === "string" ? payload.message : t("streamError");
              setStreamError(msg);
              setPhaseCards("error");
              setPhaseOutline((p) => (p === "running" ? "error" : p));
              setPhaseWork((p) => (p === "running" ? "error" : p));
            } else if (event === "done") {
              /* noop */
            }
          }
        }
      } catch (e) {
        setStreamError(e instanceof Error ? e.message : t("streamError"));
      } finally {
        setAnalyzing(false);
      }
    },
    [boardId, methodology, pasted, file, getHeaders, resetPhases, t, workItemsPayload]
  );

  const onStart = useCallback(() => {
    if (!boardId) return;
    if (!file && !pasted.trim()) {
      setStreamError(t("noInputError"));
      return;
    }
    void runStream({ remapOnly: false });
  }, [boardId, file, pasted, runStream, t]);

  const onRemap = useCallback(() => {
    if (!boardId || !workItemsPayload.trim()) return;
    void runStream({ remapOnly: true });
  }, [boardId, workItemsPayload, runStream]);

  const onApply = useCallback(async () => {
    if (!boardId || !accept || preview.length === 0) return;
    setApplying(true);
    setApplyMsg(null);
    try {
      await apiPost(
        `/api/boards/${encodeURIComponent(boardId)}/spec-plan/apply`,
        {
          cards: preview.map((r) => ({
            title: r.title,
            desc: r.desc,
            bucketKey: r.bucketKey,
            priority: r.priority,
            progress: r.progress,
            tags: r.tags,
            storyPoints: r.storyPoints,
            serviceClass: r.serviceClass as "expedite" | "fixed_date" | "standard" | "intangible" | null,
            rationale: r.rationale,
            blockedByTitles: r.blockedByTitles,
            subtasks: r.subtasks,
          })),
        },
        getHeaders()
      );
      setApplyMsg(t("applySuccess"));
    } catch (e) {
      setApplyMsg(e instanceof ApiError ? e.message : t("applyError"));
    } finally {
      setApplying(false);
    }
  }, [accept, boardId, getHeaders, preview, t]);

  const phaseRow = useMemo(() => {
    const Row = ({
      label,
      state,
    }: {
      label: string;
      state: PhaseState;
    }) => {
      const color =
        state === "done"
          ? "text-[var(--flux-accent)]"
          : state === "running"
            ? "text-[var(--flux-primary-light)]"
            : state === "error"
              ? "text-[var(--flux-danger)]"
              : "text-[var(--flux-text-muted)]";
      const status =
        state === "done"
          ? t("statusDone")
          : state === "running"
            ? t("statusRunning")
            : state === "error"
              ? t("statusError")
              : t("statusPending");
      return (
        <div className="flex items-center justify-between gap-3 rounded-[var(--flux-rad-sm)] border border-[var(--flux-primary-alpha-12)] bg-[var(--flux-black-alpha-04)] px-3 py-2 text-sm">
          <span className="font-medium text-[var(--flux-text)]">{label}</span>
          <span className={`shrink-0 text-xs font-semibold ${color}`}>{status}</span>
        </div>
      );
    };
    return (
      <div className="flex flex-col gap-2">
        <Row label={t("phaseParse")} state={phaseParse} />
        <Row label={t("phaseOutline")} state={phaseOutline} />
        <Row label={t("phaseWorkItems")} state={phaseWork} />
        <Row label={t("phaseCards")} state={phaseCards} />
      </div>
    );
  }, [phaseCards, phaseOutline, phaseParse, phaseWork, t]);

  if (!isChecked || !user) {
    return <div className="min-h-screen bg-[var(--flux-surface-dark)]" />;
  }

  if (featureOk === null) {
    return (
      <div className="min-h-screen bg-[var(--flux-surface-dark)]">
        <Header title={t("title")} backHref={`${localeRoot}/boards`} backLabel={t("headerBack")} />
        <div className="mx-auto max-w-lg px-4 py-16 text-center text-[var(--flux-text-muted)]">…</div>
      </div>
    );
  }

  if (!featureOk) {
    return (
      <div className="min-h-screen bg-[var(--flux-surface-dark)]">
        <Header title={t("title")} backHref={`${localeRoot}/boards`} backLabel={t("headerBack")} />
        <div className="mx-auto max-w-lg px-4 py-16 text-center">
          <h2 className="font-display text-xl font-bold text-[var(--flux-text)]">{t("upgradeTitle")}</h2>
          <p className="mt-3 text-sm leading-relaxed text-[var(--flux-text-muted)]">{t("upgradeBody")}</p>
          <Link
            href={`${localeRoot}/billing`}
            className="mt-6 inline-flex rounded-[var(--flux-rad-sm)] bg-[var(--flux-primary)] px-4 py-2.5 text-sm font-semibold text-white hover:opacity-95"
          >
            {t("goBilling")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--flux-surface-dark)]">
      <Header title={t("title")} backHref={`${localeRoot}/boards`} backLabel={t("headerBack")} />
      <div className="mx-auto max-w-5xl space-y-8 px-4 py-8">
        <p className="text-sm leading-relaxed text-[var(--flux-text-muted)]">{t("privacyNote")}</p>

        <div className="grid gap-6 md:grid-cols-2">
          <section className="rounded-[var(--flux-rad-sm)] border border-[var(--flux-primary-alpha-15)] bg-[linear-gradient(135deg,var(--flux-primary-alpha-08),transparent)] p-5">
            <h2 className="font-display text-sm font-bold uppercase tracking-wide text-[var(--flux-primary-light)]">
              {t("stepBoard")}
            </h2>
            <select
              className="mt-3 w-full rounded-[var(--flux-rad-sm)] border border-[var(--flux-primary-alpha-20)] bg-[var(--flux-surface-elevated)] px-3 py-2.5 text-sm text-[var(--flux-text)]"
              value={boardId}
              onChange={(e) => setBoardId(e.target.value)}
            >
              <option value="">{t("boardPlaceholder")}</option>
              {boards.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
            {boardsErr ? <p className="mt-2 text-xs text-[var(--flux-danger)]">{boardsErr}</p> : null}
          </section>

          <section className="rounded-[var(--flux-rad-sm)] border border-[var(--flux-primary-alpha-15)] bg-[var(--flux-surface-elevated)] p-5">
            <h2 className="font-display text-sm font-bold uppercase tracking-wide text-[var(--flux-primary-light)]">
              {t("stepMethod")}
            </h2>
            <div className="mt-3 flex flex-col gap-2">
              {(
                [
                  ["scrum", t("methodScrum"), t("methodHintScrum")],
                  ["kanban", t("methodKanban"), t("methodHintKanban")],
                  ["lss", t("methodLss"), t("methodHintLss")],
                ] as const
              ).map(([key, label, hint]) => (
                <label
                  key={key}
                  className={`flex cursor-pointer flex-col rounded-[var(--flux-rad-sm)] border px-3 py-2.5 text-sm transition-colors ${
                    methodology === key
                      ? "border-[var(--flux-primary-light)] bg-[var(--flux-primary-alpha-10)]"
                      : "border-[var(--flux-primary-alpha-12)] hover:border-[var(--flux-primary-alpha-25)]"
                  }`}
                >
                  <span className="flex items-center gap-2 font-semibold text-[var(--flux-text)]">
                    <input type="radio" name="meth" checked={methodology === key} onChange={() => setMethodology(key)} />
                    {label}
                  </span>
                  <span className="mt-1 pl-6 text-xs text-[var(--flux-text-muted)]">{hint}</span>
                </label>
              ))}
            </div>
          </section>
        </div>

        <section className="rounded-[var(--flux-rad-sm)] border border-[var(--flux-primary-alpha-15)] bg-[var(--flux-surface-elevated)] p-5">
          <h2 className="font-display text-sm font-bold uppercase tracking-wide text-[var(--flux-primary-light)]">
            {t("stepSource")}
          </h2>
          <label className="mt-3 block text-xs font-semibold text-[var(--flux-text-muted)]">{t("fileLabel")}</label>
          <input
            type="file"
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="mt-1 w-full text-sm text-[var(--flux-text)]"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <label className="mt-4 block text-xs font-semibold text-[var(--flux-text-muted)]">{t("pasteLabel")}</label>
          <textarea
            className="mt-1 min-h-[120px] w-full rounded-[var(--flux-rad-sm)] border border-[var(--flux-primary-alpha-20)] bg-[var(--flux-surface-dark)] px-3 py-2 text-sm text-[var(--flux-text)]"
            placeholder={t("pastePlaceholder")}
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
          />
          <button
            type="button"
            disabled={!boardId || analyzing}
            onClick={() => void onStart()}
            className="mt-4 w-full rounded-[var(--flux-rad-sm)] bg-[var(--flux-primary)] py-3 text-sm font-bold text-white disabled:opacity-40 md:w-auto md:px-8"
          >
            {analyzing ? "…" : t("startAnalysis")}
          </button>
        </section>

        <section className="rounded-[var(--flux-rad-sm)] border border-[var(--flux-primary-alpha-15)] bg-[var(--flux-black-alpha-04)] p-5">
          <h2 className="font-display text-sm font-bold text-[var(--flux-text)]">{t("timelineTitle")}</h2>
          <div className="mt-4 grid gap-6 md:grid-cols-2">
            {phaseRow}
            <div className="space-y-2 text-xs text-[var(--flux-text-muted)]">
              {outlineSummary ? (
                <p>
                  <span className="font-semibold text-[var(--flux-text)]">Outline — </span>
                  {outlineSummary}
                </p>
              ) : null}
              {methodologySummary ? (
                <p>
                  <span className="font-semibold text-[var(--flux-text)]">{t("methodologyBlockLabel")}: </span>
                  {methodologySummary}
                </p>
              ) : null}
            </div>
          </div>
          {streamError ? <p className="mt-3 text-sm text-[var(--flux-danger)]">{streamError}</p> : null}
        </section>

        {preview.length > 0 ? (
          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-display text-lg font-bold text-[var(--flux-text)]">
                {t("previewTitle")} · {t("previewCount", { count: preview.length })}
              </h2>
              <button
                type="button"
                disabled={!workItemsPayload || analyzing}
                onClick={() => void onRemap()}
                className="rounded-[var(--flux-rad-sm)] border border-[var(--flux-primary-alpha-25)] px-3 py-2 text-xs font-semibold text-[var(--flux-primary-light)] disabled:opacity-40"
              >
                {t("regenerateMapping")}
              </button>
            </div>
            <div className="overflow-x-auto rounded-[var(--flux-rad-sm)] border border-[var(--flux-primary-alpha-12)]">
              <table className="w-full min-w-[720px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-[var(--flux-primary-alpha-12)] bg-[var(--flux-surface-elevated)] text-xs uppercase tracking-wide text-[var(--flux-text-muted)]">
                    <th className="p-2">{t("colTitle")}</th>
                    <th className="p-2">{t("colBucket")}</th>
                    <th className="p-2">{t("colPriority")}</th>
                    <th className="p-2">{t("colTags")}</th>
                    <th className="p-2">{t("colRationale")}</th>
                    <th className="p-2" />
                  </tr>
                </thead>
                <tbody>
                  {preview.map((row, i) => (
                    <tr key={i} className="border-b border-[var(--flux-primary-alpha-08)]">
                      <td className="p-2 align-top">
                        <input
                          className="w-full min-w-[140px] rounded border border-[var(--flux-primary-alpha-15)] bg-[var(--flux-surface-dark)] px-2 py-1 text-[var(--flux-text)]"
                          value={row.title}
                          onChange={(e) =>
                            setPreview((p) => p.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))
                          }
                        />
                      </td>
                      <td className="p-2 align-top">
                        <select
                          className="w-full min-w-[120px] rounded border border-[var(--flux-primary-alpha-15)] bg-[var(--flux-surface-dark)] px-2 py-1 text-[var(--flux-text)]"
                          value={buckets.some((b) => b.key === row.bucketKey) ? row.bucketKey : buckets[0]?.key || ""}
                          onChange={(e) =>
                            setPreview((p) => p.map((x, j) => (j === i ? { ...x, bucketKey: e.target.value } : x)))
                          }
                        >
                          {(buckets.length ? buckets : [{ key: row.bucketKey, label: row.bucketKey }]).map((b) => (
                            <option key={b.key} value={b.key}>
                              {b.label || b.key}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="p-2 align-top">
                        <select
                          className="w-full rounded border border-[var(--flux-primary-alpha-15)] bg-[var(--flux-surface-dark)] px-2 py-1 text-[var(--flux-text)]"
                          value={row.priority}
                          onChange={(e) =>
                            setPreview((p) => p.map((x, j) => (j === i ? { ...x, priority: e.target.value } : x)))
                          }
                        >
                          <option>Urgente</option>
                          <option>Importante</option>
                          <option>Média</option>
                        </select>
                      </td>
                      <td className="p-2 align-top">
                        <input
                          className="w-full min-w-[100px] rounded border border-[var(--flux-primary-alpha-15)] bg-[var(--flux-surface-dark)] px-2 py-1 text-[var(--flux-text)]"
                          value={row.tags.join(", ")}
                          onChange={(e) =>
                            setPreview((p) =>
                              p.map((x, j) =>
                                j === i
                                  ? {
                                      ...x,
                                      tags: e.target.value
                                        .split(",")
                                        .map((s) => s.trim())
                                        .filter(Boolean),
                                    }
                                  : x
                              )
                            )
                          }
                        />
                      </td>
                      <td className="max-w-[200px] p-2 align-top">
                        <details className="text-xs text-[var(--flux-text-muted)]">
                          <summary className="cursor-pointer text-[var(--flux-primary-light)]">{t("colRationale")}</summary>
                          <p className="mt-1 whitespace-pre-wrap">{row.rationale || "—"}</p>
                        </details>
                      </td>
                      <td className="p-2 align-top">
                        <button
                          type="button"
                          className="text-xs text-[var(--flux-danger)]"
                          onClick={() => setPreview((p) => p.filter((_, j) => j !== i))}
                        >
                          {t("removeRow")}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <label className="flex items-start gap-2 text-sm text-[var(--flux-text-muted)]">
              <input type="checkbox" checked={accept} onChange={(e) => setAccept(e.target.checked)} className="mt-1" />
              <span>{t("acceptCheck")}</span>
            </label>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                disabled={!accept || applying || preview.length === 0}
                onClick={() => void onApply()}
                className="rounded-[var(--flux-rad-sm)] bg-[var(--flux-accent)] px-6 py-3 text-sm font-bold text-[var(--flux-surface-dark)] disabled:opacity-40"
              >
                {applying ? t("applying") : t("applyCards")}
              </button>
              <Link
                href={`${localeRoot}/board/${encodeURIComponent(boardId)}`}
                className="inline-flex items-center rounded-[var(--flux-rad-sm)] border border-[var(--flux-primary-alpha-25)] px-6 py-3 text-sm font-semibold text-[var(--flux-primary-light)]"
              >
                {t("openBoard")}
              </Link>
            </div>
            {applyMsg ? <p className="text-sm text-[var(--flux-accent)]">{applyMsg}</p> : null}
          </section>
        ) : null}
      </div>
    </div>
  );
}
