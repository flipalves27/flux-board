"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { useAuth } from "@/context/auth-context";
import { apiPost, ApiError } from "@/lib/api-client";
import { useModalA11y } from "@/components/ui/use-modal-a11y";
import type { SprintData } from "@/lib/schemas";

type Props = {
  open: boolean;
  onClose: () => void;
  boardId: string;
  sprint: SprintData | null;
};

export function ForgeSprintBatchDialog({ open, onClose, boardId, sprint }: Props) {
  const router = useRouter();
  const locale = useLocale();
  const { getHeaders } = useAuth();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [repo, setRepo] = useState("");
  const [tier, setTier] = useState<"oneshot" | "tested" | "autonomous">("oneshot");
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  useModalA11y({ open, onClose, containerRef: panelRef });

  const cardIds = useMemo(() => sprint?.cardIds ?? [], [sprint]);

  const toggleAll = useCallback(() => {
    const next: Record<string, boolean> = {};
    const allOn = cardIds.every((id) => selected[id]);
    for (const id of cardIds) next[id] = !allOn;
    setSelected(next);
  }, [cardIds, selected]);

  const start = useCallback(async () => {
    const ids = cardIds.filter((id) => selected[id] !== false);
    const effective = ids.length ? ids : cardIds;
    if (!effective.length || !repo.includes("/")) return;
    setBusy(true);
    try {
      const res = await apiPost<{ run?: { _id: string }; runs?: { _id: string }[] }>(
        "/api/forge/runs",
        {
          boardId,
          cardIds: effective,
          tier,
          repoFullName: repo.trim(),
        },
        getHeaders()
      );
      onClose();
      if (res.run?._id) {
        router.push(`/${locale}/forge/runs/${encodeURIComponent(res.run._id)}`);
      } else {
        router.push(`/${locale}/forge/runs?batch=1`);
      }
    } catch (e) {
      console.error(e instanceof ApiError ? e.message : e);
    } finally {
      setBusy(false);
    }
  }, [boardId, cardIds, getHeaders, onClose, repo, router, selected, tier, locale]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[var(--flux-z-modal)] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Forge sprint batch"
        tabIndex={-1}
        className="max-h-[85vh] w-full max-w-lg overflow-hidden rounded-2xl border border-[var(--flux-border-default)] bg-[var(--flux-surface-card)] shadow-[var(--flux-shadow-lg)]"
      >
        <div className="border-b border-[var(--flux-chrome-alpha-08)] px-4 py-3">
          <h2 className="font-display text-base font-semibold text-[var(--flux-text)]">Generate code for sprint</h2>
          <p className="text-xs text-[var(--flux-text-muted)]">{sprint?.name ?? "Sprint"} · {cardIds.length} cards</p>
        </div>
        <div className="max-h-[48vh] overflow-y-auto px-4 py-3">
          <button type="button" onClick={toggleAll} className="mb-2 text-xs font-semibold text-[var(--flux-primary-light)]">
            Toggle all
          </button>
          <ul className="space-y-1">
            {cardIds.map((id) => (
              <li key={id}>
                <label className="flex items-center gap-2 text-xs text-[var(--flux-text)]">
                  <input
                    type="checkbox"
                    checked={selected[id] !== false}
                    onChange={() => setSelected((s) => ({ ...s, [id]: s[id] === false }))}
                  />
                  <span className="font-mono">{id}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
        <div className="space-y-2 border-t border-[var(--flux-chrome-alpha-08)] px-4 py-3">
          <input
            className="w-full rounded-lg border border-[var(--flux-control-border)] bg-[var(--flux-surface-dark)] px-3 py-2 text-sm"
            placeholder="org/repo"
            value={repo}
            onChange={(e) => setRepo(e.target.value)}
          />
          <div className="flex gap-2">
            {(["oneshot", "tested", "autonomous"] as const).map((x) => (
              <button
                key={x}
                type="button"
                onClick={() => setTier(x)}
                className={`rounded-lg px-2 py-1 text-[11px] font-semibold capitalize ${
                  tier === x ? "bg-[var(--flux-primary-alpha-20)] text-[var(--flux-primary-light)]" : "text-[var(--flux-text-muted)]"
                }`}
              >
                {x}
              </button>
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-[var(--flux-chrome-alpha-08)] px-4 py-3">
          <button type="button" className="text-sm font-semibold text-[var(--flux-text-muted)]" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void start()}
            className="rounded-lg bg-[var(--flux-primary)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? "…" : "Start batch"}
          </button>
        </div>
      </div>
    </div>
  );
}
