"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useAuth } from "@/context/auth-context";
import { apiPost, ApiError } from "@/lib/api-client";
import { useModalA11y } from "@/components/ui/use-modal-a11y";

type Props = {
  defaultBoardId?: string;
  defaultCardIds?: string[];
};

export function ForgeNewRunDialog({ defaultBoardId, defaultCardIds }: Props) {
  const router = useRouter();
  const locale = useLocale();
  const { getHeaders } = useAuth();
  const t = useTranslations("forgePage");
  const [open, setOpen] = useState(false);
  const [repo, setRepo] = useState("");
  const [tier, setTier] = useState<"oneshot" | "tested" | "autonomous">("oneshot");
  const [cardIdInput, setCardIdInput] = useState((defaultCardIds ?? []).join(", "));
  const [eventBoardId, setEventBoardId] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useModalA11y({ open, onClose: () => setOpen(false), containerRef: panelRef });

  useEffect(() => {
    const onEv = (e: Event) => {
      const d = (e as CustomEvent<{ boardId?: string; cardIds?: string[] }>).detail;
      setEventBoardId(d?.boardId);
      if (d?.cardIds?.length) setCardIdInput(d.cardIds.join(", "));
      setOpen(true);
    };
    window.addEventListener("flux-forge-new-run", onEv);
    return () => window.removeEventListener("flux-forge-new-run", onEv);
  }, []);

  const start = useCallback(async () => {
    const cardIds = cardIdInput
      .split(/[,\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const finalIds =
      cardIds.length > 0 ? cardIds : (defaultCardIds?.length ? defaultCardIds : []);
    if (!finalIds.length || !repo.includes("/")) return;
    setBusy(true);
    try {
      const res = await apiPost<{ run?: { _id: string } }>(
        "/api/forge/runs",
        {
          boardId: eventBoardId ?? defaultBoardId,
          cardIds: finalIds,
          tier,
          repoFullName: repo.trim(),
        },
        getHeaders()
      );
      if (res.run?._id) {
        setOpen(false);
        router.push(`/${locale}/forge/runs/${encodeURIComponent(res.run._id)}`);
      }
    } catch (e) {
      console.error(e instanceof ApiError ? e.message : e);
    } finally {
      setBusy(false);
    }
  }, [cardIdInput, defaultBoardId, defaultCardIds, eventBoardId, getHeaders, repo, router, tier, locale]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[var(--flux-z-modal)] flex items-center justify-center bg-black/55 p-4 backdrop-blur-[2px]"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          setOpen(false);
          setEventBoardId(undefined);
        }
      }}
    >
      <div
        ref={panelRef}
        className="w-full max-w-md rounded-[var(--flux-rad-lg)] border border-[var(--flux-border-default)] bg-[var(--flux-surface-card)] p-5 shadow-[var(--flux-shadow-lg)]"
        role="dialog"
        aria-modal="true"
        aria-label={t("newRun")}
        tabIndex={-1}
      >
        <h2 className="font-display text-lg font-semibold text-[var(--flux-text)]">{t("newRun")}</h2>
        <div className="mt-4 space-y-3">
          <label className="block text-xs font-semibold text-[var(--flux-text-muted)]">org/repo</label>
          <input
            className="w-full rounded-lg border border-[var(--flux-control-border)] bg-[var(--flux-surface-dark)] px-3 py-2 text-sm text-[var(--flux-text)]"
            value={repo}
            onChange={(e) => setRepo(e.target.value)}
            placeholder="acme/web"
          />
          <label className="block text-xs font-semibold text-[var(--flux-text-muted)]">Card IDs</label>
          <input
            className="w-full rounded-lg border border-[var(--flux-control-border)] bg-[var(--flux-surface-dark)] px-3 py-2 text-sm text-[var(--flux-text)]"
            value={cardIdInput}
            onChange={(e) => setCardIdInput(e.target.value)}
            placeholder="c_abc, c_def"
          />
          <div className="flex gap-2">
            {(["oneshot", "tested", "autonomous"] as const).map((x) => (
              <button
                key={x}
                type="button"
                onClick={() => setTier(x)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize ${
                  tier === x
                    ? "bg-[var(--flux-primary-alpha-20)] text-[var(--flux-primary-light)]"
                    : "border border-[var(--flux-chrome-alpha-12)] text-[var(--flux-text-muted)]"
                }`}
              >
                {x}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            className="rounded-lg px-3 py-2 text-sm font-semibold text-[var(--flux-text-muted)]"
            onClick={() => setOpen(false)}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void start()}
            className="rounded-lg bg-[var(--flux-primary)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? "…" : "Start"}
          </button>
        </div>
      </div>
    </div>
  );
}
