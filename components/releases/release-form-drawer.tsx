"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiJson, getApiHeaders } from "@/lib/api-client";
import type {
  ReleaseChangelogEntry,
  ReleaseData,
  ReleaseEnvironment,
  ReleaseStatus,
  ReleaseVersionType,
  SprintData,
} from "@/lib/schemas";

type Props = {
  open: boolean;
  onClose: () => void;
  boardId: string;
  release?: ReleaseData | null;
  sprints: SprintData[];
  getHeaders: () => Record<string, string>;
  onSaved: (release: ReleaseData) => void;
};

type SuggestPayload = {
  suggestion: {
    version: string;
    versionType: ReleaseVersionType;
    previousVersion: string;
    sprintId: string | null;
    sprintName: string | null;
    cardIds: string[];
    changelog: ReleaseChangelogEntry[];
  };
};

export function ReleaseFormDrawer({ open, onClose, boardId, release, sprints, getHeaders, onSaved }: Props) {
  const t = useTranslations("releases.form");
  const [version, setVersion] = useState("");
  const [name, setName] = useState("");
  const [summary, setSummary] = useState("");
  const [versionType, setVersionType] = useState<ReleaseVersionType>("minor");
  const [status, setStatus] = useState<ReleaseStatus>("draft");
  const [environment, setEnvironment] = useState<ReleaseEnvironment>("production");
  const [selectedSprintIds, setSelectedSprintIds] = useState<string[]>([]);
  const [cardIds, setCardIds] = useState<string[]>([]);
  const [tags, setTags] = useState("");
  const [humanNotes, setHumanNotes] = useState("");
  const [deploymentRef, setDeploymentRef] = useState("");
  const [plannedAt, setPlannedAt] = useState("");
  const [changelog, setChangelog] = useState<ReleaseChangelogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (release) {
      setVersion(release.version);
      setName(release.name);
      setSummary(release.summary);
      setVersionType(release.versionType);
      setStatus(release.status);
      setEnvironment(release.environment);
      setSelectedSprintIds(release.sprintIds);
      setCardIds(release.cardIds);
      setTags(release.tags.join(", "));
      setHumanNotes(release.humanNotes);
      setDeploymentRef(release.deploymentRef);
      setPlannedAt(release.plannedAt ?? "");
      setChangelog(release.changelog);
    } else {
      setVersion("");
      setName("");
      setSummary("");
      setVersionType("minor");
      setStatus("draft");
      setEnvironment("production");
      setSelectedSprintIds([]);
      setCardIds([]);
      setTags("");
      setHumanNotes("");
      setDeploymentRef("");
      setPlannedAt("");
      setChangelog([]);
    }
    setError(null);
  }, [open, release]);

  const suggest = async () => {
    setError(null);
    try {
      const sid = selectedSprintIds[0];
      const url = `/api/boards/${encodeURIComponent(boardId)}/releases/suggest${sid ? `?sprintId=${encodeURIComponent(sid)}` : ""}`;
      const data = await apiJson<SuggestPayload>(url, { method: "GET", headers: getApiHeaders(getHeaders()) });
      const s = data.suggestion;
      if (!version) setVersion(s.version);
      setVersionType(s.versionType);
      if (s.cardIds.length > 0) setCardIds(s.cardIds);
      if (s.changelog.length > 0) setChangelog(s.changelog);
      if (!name && s.sprintName) setName(`Release ${s.sprintName}`);
      if (s.sprintId && !selectedSprintIds.includes(s.sprintId)) {
        setSelectedSprintIds((prev) => [...prev, s.sprintId!]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("suggestError"));
    }
  };

  const save = async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = {
        version: version.trim(),
        name: name.trim(),
        summary: summary.trim(),
        versionType,
        status,
        environment,
        sprintIds: selectedSprintIds,
        cardIds,
        changelog,
        humanNotes: humanNotes.trim(),
        deploymentRef: deploymentRef.trim(),
        plannedAt: plannedAt.trim() || null,
        tags: tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
      };

      const url = release
        ? `/api/boards/${encodeURIComponent(boardId)}/releases/${encodeURIComponent(release.id)}`
        : `/api/boards/${encodeURIComponent(boardId)}/releases`;
      const method = release ? "PATCH" : "POST";

      const data = await apiJson<{ release: ReleaseData }>(url, {
        method,
        body: JSON.stringify(payload),
        headers: getApiHeaders(getHeaders()),
      });
      onSaved(data.release);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("saveError"));
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <aside className="relative z-10 flex h-full w-full max-w-xl flex-col overflow-hidden bg-[var(--flux-surface-elevated)] shadow-flux-xl">
        <header className="flex items-center justify-between border-b border-[var(--flux-chrome-alpha-08)] px-5 py-4">
          <div>
            <h2 className="font-display text-lg font-bold text-[var(--flux-text)]">
              {release ? t("editTitle") : t("createTitle")}
            </h2>
            <p className="text-xs text-[var(--flux-text-muted)]">{t("subtitle")}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-[var(--flux-rad-sm)] px-2 py-1 text-xs text-[var(--flux-text-muted)] hover:bg-[var(--flux-chrome-alpha-06)]"
          >
            {t("close")}
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("version")}>
              <div className="flex gap-2">
                <input
                  value={version}
                  onChange={(e) => setVersion(e.target.value)}
                  placeholder="1.4.0"
                  className="flex-1 rounded-[var(--flux-rad-sm)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-card)] px-2 py-1.5 text-sm"
                />
                <button
                  type="button"
                  onClick={() => void suggest()}
                  className="shrink-0 rounded-[var(--flux-rad-sm)] border border-[var(--flux-primary-alpha-25)] bg-[var(--flux-primary-alpha-08)] px-2.5 py-1.5 text-xs font-semibold text-[var(--flux-primary-light)] hover:bg-[var(--flux-primary-alpha-18)]"
                  title={t("suggestTitle")}
                >
                  ✨ {t("suggest")}
                </button>
              </div>
            </Field>
            <Field label={t("name")}>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-[var(--flux-rad-sm)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-card)] px-2 py-1.5 text-sm"
              />
            </Field>
          </div>

          <Field label={t("summary")}>
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={2}
              className="w-full rounded-[var(--flux-rad-sm)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-card)] px-2 py-1.5 text-sm"
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label={t("versionType")}>
              <select
                value={versionType}
                onChange={(e) => setVersionType(e.target.value as ReleaseVersionType)}
                className="w-full rounded-[var(--flux-rad-sm)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-card)] px-2 py-1.5 text-sm"
              >
                <option value="major">{t("types.major")}</option>
                <option value="minor">{t("types.minor")}</option>
                <option value="patch">{t("types.patch")}</option>
                <option value="hotfix">{t("types.hotfix")}</option>
              </select>
            </Field>
            <Field label={t("status")}>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as ReleaseStatus)}
                className="w-full rounded-[var(--flux-rad-sm)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-card)] px-2 py-1.5 text-sm"
              >
                <option value="draft">{t("statuses.draft")}</option>
                <option value="planned">{t("statuses.planned")}</option>
                <option value="in_review">{t("statuses.in_review")}</option>
                <option value="staging">{t("statuses.staging")}</option>
                <option value="released">{t("statuses.released")}</option>
                <option value="rolled_back">{t("statuses.rolled_back")}</option>
              </select>
            </Field>
            <Field label={t("environment")}>
              <select
                value={environment}
                onChange={(e) => setEnvironment(e.target.value as ReleaseEnvironment)}
                className="w-full rounded-[var(--flux-rad-sm)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-card)] px-2 py-1.5 text-sm"
              >
                <option value="dev">dev</option>
                <option value="staging">staging</option>
                <option value="production">production</option>
              </select>
            </Field>
          </div>

          <Field label={t("sprints")}>
            <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto rounded-[var(--flux-rad-sm)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-card)] p-2">
              {sprints.length === 0 ? (
                <span className="text-xs text-[var(--flux-text-muted)]">{t("noSprints")}</span>
              ) : (
                sprints.map((s) => {
                  const active = selectedSprintIds.includes(s.id);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() =>
                        setSelectedSprintIds((prev) =>
                          prev.includes(s.id) ? prev.filter((x) => x !== s.id) : [...prev, s.id]
                        )
                      }
                      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold transition-colors ${
                        active
                          ? "bg-[var(--flux-primary)] text-white"
                          : "bg-[var(--flux-chrome-alpha-06)] text-[var(--flux-text-muted)] hover:bg-[var(--flux-chrome-alpha-12)]"
                      }`}
                    >
                      {s.name}
                    </button>
                  );
                })
              )}
            </div>
          </Field>

          {changelog.length > 0 ? (
            <Field label={t("changelog")}>
              <ul className="max-h-40 space-y-1 overflow-y-auto rounded-[var(--flux-rad-sm)] border border-[var(--flux-chrome-alpha-08)] bg-[var(--flux-surface-card)] p-2">
                {changelog.map((c, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs">
                    <span className="shrink-0 rounded-full bg-[var(--flux-primary-alpha-10)] px-1.5 py-0.5 text-[10px] font-bold uppercase text-[var(--flux-primary-light)]">
                      {c.kind}
                    </span>
                    <span className="flex-1 text-[var(--flux-text)]">{c.title}</span>
                  </li>
                ))}
              </ul>
            </Field>
          ) : null}

          <Field label={t("notes")}>
            <textarea
              value={humanNotes}
              onChange={(e) => setHumanNotes(e.target.value)}
              rows={4}
              placeholder={t("notesPlaceholder")}
              className="w-full rounded-[var(--flux-rad-sm)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-card)] px-2 py-1.5 font-mono text-xs"
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("deploymentRef")}>
              <input
                value={deploymentRef}
                onChange={(e) => setDeploymentRef(e.target.value)}
                placeholder="PR #, commit, run id"
                className="w-full rounded-[var(--flux-rad-sm)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-card)] px-2 py-1.5 text-sm"
              />
            </Field>
            <Field label={t("plannedAt")}>
              <input
                type="date"
                value={plannedAt.slice(0, 10)}
                onChange={(e) => setPlannedAt(e.target.value)}
                className="w-full rounded-[var(--flux-rad-sm)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-card)] px-2 py-1.5 text-sm"
              />
            </Field>
          </div>

          <Field label={t("tags")}>
            <input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder={t("tagsPlaceholder")}
              className="w-full rounded-[var(--flux-rad-sm)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-card)] px-2 py-1.5 text-sm"
            />
          </Field>
        </div>

        {error ? (
          <div className="border-t border-[var(--flux-danger-alpha-22)] bg-[var(--flux-danger-alpha-08)] px-5 py-2 text-xs text-[var(--flux-danger)]">
            {error}
          </div>
        ) : null}

        <footer className="flex items-center justify-end gap-2 border-t border-[var(--flux-chrome-alpha-08)] px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-[var(--flux-rad-sm)] border border-[var(--flux-chrome-alpha-12)] px-3 py-1.5 text-xs font-semibold text-[var(--flux-text)] hover:bg-[var(--flux-chrome-alpha-06)]"
          >
            {t("cancel")}
          </button>
          <button
            type="button"
            disabled={loading || !version.trim() || !name.trim()}
            onClick={() => void save()}
            className="rounded-[var(--flux-rad-sm)] bg-[var(--flux-primary)] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-95 disabled:opacity-50"
          >
            {loading ? t("saving") : t("save")}
          </button>
        </footer>
      </aside>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--flux-text-muted)]">
        {label}
      </span>
      {children}
    </label>
  );
}
