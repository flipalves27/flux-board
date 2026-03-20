"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useModalA11y } from "@/components/ui/use-modal-a11y";
import { apiFetch, getApiHeaders } from "@/lib/api-client";
import { useToast } from "@/context/toast-context";
type BucketConfig = { key: string; label: string; color: string };

export type PortalClientState = {
  enabled?: boolean;
  token?: string;
  passwordProtected?: boolean;
  visibleBucketKeys?: string[];
  cardIdsAllowlist?: string[];
  branding?: {
    logoUrl?: string;
    primaryColor?: string;
    secondaryColor?: string;
    title?: string;
  };
};

type Props = {
  open: boolean;
  onClose: () => void;
  boardId: string;
  bucketOrder: BucketConfig[];
  portal: PortalClientState | undefined;
  getHeaders: () => Record<string, string>;
  onSaved: (portal: PortalClientState | undefined) => void;
};

export function BoardPortalModal({ open, onClose, boardId, bucketOrder, portal, getHeaders, onSaved }: Props) {
  const t = useTranslations("board.portal");
  const locale = useLocale();
  const { pushToast } = useToast();
  const containerRef = useRef<HTMLDivElement>(null);
  useModalA11y({ open, onClose, containerRef });

  const [enabled, setEnabled] = useState(false);
  const [columnOn, setColumnOn] = useState<Record<string, boolean>>({});
  const [cardIdsText, setCardIdsText] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [primaryColor, setPrimaryColor] = useState("");
  const [secondaryColor, setSecondaryColor] = useState("");
  const [displayTitle, setDisplayTitle] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [removePassword, setRemovePassword] = useState(false);
  const [saving, setSaving] = useState(false);

  const allKeys = useMemo(() => bucketOrder.map((b) => b.key), [bucketOrder]);

  const resetFromProps = useCallback(() => {
    setEnabled(Boolean(portal?.enabled));
    const vis = portal?.visibleBucketKeys;
    const next: Record<string, boolean> = {};
    for (const k of allKeys) {
      if (!vis || vis.length === 0) next[k] = true;
      else next[k] = vis.includes(k);
    }
    setColumnOn(next);
    setCardIdsText((portal?.cardIdsAllowlist || []).join("\n"));
    setLogoUrl(portal?.branding?.logoUrl || "");
    setPrimaryColor(portal?.branding?.primaryColor || "");
    setSecondaryColor(portal?.branding?.secondaryColor || "");
    setDisplayTitle(portal?.branding?.title || "");
    setNewPassword("");
    setRemovePassword(false);
  }, [portal, allKeys]);

  useEffect(() => {
    if (open) resetFromProps();
  }, [open, resetFromProps]);

  const save = async (regenerateToken: boolean) => {
    setSaving(true);
    try {
      const selectedKeys = allKeys.filter((k) => columnOn[k]);
      if (allKeys.length > 0 && selectedKeys.length === 0) {
        pushToast({ kind: "error", title: t("columnsError") });
        setSaving(false);
        return;
      }
      const visibleBucketKeys =
        allKeys.length === 0 || selectedKeys.length === allKeys.length ? undefined : selectedKeys;

      const lines = cardIdsText
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
      const cardIdsAllowlist = lines.length ? lines.slice(0, 50) : undefined;

      const body: Record<string, unknown> = {
        portal: {
          enabled,
          regenerateToken,
          visibleBucketKeys: visibleBucketKeys === undefined ? [] : visibleBucketKeys,
          cardIdsAllowlist: cardIdsAllowlist ?? [],
          branding: {
            logoUrl: logoUrl.trim() || null,
            primaryColor: primaryColor.trim() || null,
            secondaryColor: secondaryColor.trim() || null,
            title: displayTitle.trim() || null,
          },
        },
      };

      if (removePassword && portal?.passwordProtected) {
        (body.portal as Record<string, unknown>).portalPassword = "";
      } else if (newPassword.trim().length >= 4) {
        (body.portal as Record<string, unknown>).portalPassword = newPassword.trim();
      }

      const res = await apiFetch(`/api/boards/${encodeURIComponent(boardId)}`, {
        method: "PUT",
        headers: getApiHeaders(getHeaders()),
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { error?: string; portal?: PortalClientState };
      if (!res.ok) throw new Error(data.error || "save");
      if (data.portal) onSaved(data.portal);
      pushToast({ kind: "success", title: t("saveSuccess") });
      setNewPassword("");
      setRemovePassword(false);
      onClose();
    } catch {
      pushToast({ kind: "error", title: t("saveError") });
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 bg-black/55 backdrop-blur-[2px]">
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="portal-modal-title"
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-[var(--flux-rad-lg)] border border-[rgba(108,92,231,0.35)] bg-[var(--flux-surface-card)] shadow-[var(--shadow-md)] p-6"
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h2 id="portal-modal-title" className="text-lg font-semibold font-display text-[var(--flux-text)]">
              {t("title")}
            </h2>
            <p className="text-xs text-[var(--flux-text-muted)] mt-1">{t("hint")}</p>
            {enabled && portal?.token ? (
              <button
                type="button"
                className="mt-2 text-xs font-semibold text-[var(--flux-secondary)] hover:underline"
                onClick={async () => {
                  const url = `${typeof window !== "undefined" ? window.location.origin : ""}/${locale}/portal/${encodeURIComponent(portal.token!)}`;
                  try {
                    await navigator.clipboard.writeText(url);
                    pushToast({ kind: "success", title: t("copied") });
                  } catch {
                    pushToast({ kind: "error", title: t("saveError") });
                  }
                }}
              >
                {t("copyLink")}
              </button>
            ) : null}
          </div>
          <button type="button" className="btn-secondary text-xs py-1 px-2" onClick={onClose}>
            {t("close")}
          </button>
        </div>

        <label className="flex items-center gap-2 text-sm text-[var(--flux-text)] mb-4">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          {t("enabled")}
        </label>

        <div className="space-y-4 text-sm">
          <div>
            <p className="text-xs font-semibold text-[var(--flux-text-muted)] mb-2">{t("columns")}</p>
            <p className="text-[11px] text-[var(--flux-text-muted)] mb-2">{t("columnsHint")}</p>
            <div className="flex flex-col gap-1.5 max-h-36 overflow-y-auto pr-1">
              {bucketOrder.map((b) => (
                <label key={b.key} className="flex items-center gap-2 text-[var(--flux-text)]">
                  <input
                    type="checkbox"
                    checked={columnOn[b.key] !== false}
                    onChange={(e) => setColumnOn((prev) => ({ ...prev, [b.key]: e.target.checked }))}
                  />
                  <span className="truncate">{b.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-[var(--flux-text-muted)] mb-1">{t("cardIds")}</p>
            <p className="text-[11px] text-[var(--flux-text-muted)] mb-2">{t("cardIdsHint")}</p>
            <textarea
              value={cardIdsText}
              onChange={(e) => setCardIdsText(e.target.value)}
              rows={4}
              className="w-full rounded-[var(--flux-rad)] border border-[rgba(155,151,194,0.35)] bg-[var(--flux-surface-mid)] px-3 py-2 text-xs font-mono text-[var(--flux-text)]"
              placeholder="card_1&#10;card_2"
            />
          </div>

          <div>
            <p className="text-xs font-semibold text-[var(--flux-text-muted)] mb-2">{t("branding")}</p>
            <div className="grid gap-2">
              <input
                type="url"
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                placeholder={t("logoUrl")}
                className="w-full rounded-[var(--flux-rad)] border border-[rgba(155,151,194,0.35)] bg-[var(--flux-surface-mid)] px-3 py-2 text-xs text-[var(--flux-text)]"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  placeholder={t("primaryColor")}
                  className="rounded-[var(--flux-rad)] border border-[rgba(155,151,194,0.35)] bg-[var(--flux-surface-mid)] px-3 py-2 text-xs text-[var(--flux-text)]"
                />
                <input
                  type="text"
                  value={secondaryColor}
                  onChange={(e) => setSecondaryColor(e.target.value)}
                  placeholder={t("secondaryColor")}
                  className="rounded-[var(--flux-rad)] border border-[rgba(155,151,194,0.35)] bg-[var(--flux-surface-mid)] px-3 py-2 text-xs text-[var(--flux-text)]"
                />
              </div>
              <input
                type="text"
                value={displayTitle}
                onChange={(e) => setDisplayTitle(e.target.value)}
                placeholder={t("displayTitle")}
                className="w-full rounded-[var(--flux-rad)] border border-[rgba(155,151,194,0.35)] bg-[var(--flux-surface-mid)] px-3 py-2 text-xs text-[var(--flux-text)]"
              />
            </div>
          </div>

          <div className="border-t border-[rgba(155,151,194,0.15)] pt-4">
            <p className="text-xs font-semibold text-[var(--flux-text-muted)] mb-2">{t("passwordNew")}</p>
            {portal?.passwordProtected ? (
              <label className="flex items-center gap-2 text-xs text-[var(--flux-text)] mb-2">
                <input type="checkbox" checked={removePassword} onChange={(e) => setRemovePassword(e.target.checked)} />
                {t("removePassword")}
              </label>
            ) : null}
            <input
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              disabled={removePassword}
              placeholder={t("passwordPlaceholder")}
              className="w-full rounded-[var(--flux-rad)] border border-[rgba(155,151,194,0.35)] bg-[var(--flux-surface-mid)] px-3 py-2 text-xs text-[var(--flux-text)] disabled:opacity-50"
            />
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-primary flex-1 min-w-[120px]" disabled={saving} onClick={() => void save(false)}>
              {saving ? t("saving") : t("save")}
            </button>
            <button type="button" className="btn-secondary flex-1 min-w-[120px]" disabled={saving} onClick={onClose}>
              {t("close")}
            </button>
          </div>
          <button
            type="button"
            className="text-xs text-[var(--flux-text-muted)] underline underline-offset-2 hover:text-[var(--flux-secondary)]"
            disabled={saving || !enabled}
            onClick={() => void save(true)}
          >
            {t("regenerateToken")} — {t("regenerateHint")}
          </button>
        </div>
      </div>
    </div>
  );
}
