"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiGet } from "@/lib/api-client";
import { BoardTemplateExportModal } from "@/components/board/board-template-export-modal";

type Props = {
  getHeaders: () => Record<string, string>;
  isAdmin: boolean;
};

export function PriorityMatrixTemplatePanel({ getHeaders, isAdmin }: Props) {
  const t = useTranslations("templates");
  const [boards, setBoards] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBoardId, setSelectedBoardId] = useState("");
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data = await apiGet<{ boards: { id: string; name: string }[] }>("/api/boards", getHeaders());
        if (!cancelled) {
          const list = data?.boards ?? [];
          setBoards(list);
          setSelectedBoardId((prev) => (prev && list.some((b) => b.id === prev) ? prev : list[0]?.id ?? ""));
        }
      } catch {
        if (!cancelled) {
          setBoards([]);
          setSelectedBoardId("");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [getHeaders]);

  if (!isAdmin) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-[var(--flux-text-muted)]">{t("matrixPanel.nonAdmin")}</p>
        <p className="text-xs text-[var(--flux-text-muted)] leading-relaxed">{t("matrixPanel.nonAdminHint")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--flux-text-muted)] leading-relaxed">{t("matrixPanel.hint")}</p>
      {loading ? (
        <p className="text-xs text-[var(--flux-text-muted)]">{t("matrixPanel.loadingBoards")}</p>
      ) : boards.length === 0 ? (
        <p className="text-xs text-[var(--flux-text-muted)]">{t("matrixPanel.noBoards")}</p>
      ) : (
        <>
          <div>
            <label className="block text-xs font-semibold text-[var(--flux-text-muted)] mb-1">{t("matrixPanel.selectBoard")}</label>
            <select
              value={selectedBoardId}
              onChange={(e) => setSelectedBoardId(e.target.value)}
              className="w-full max-w-md px-3 py-2 rounded-[var(--flux-rad)] bg-[var(--flux-surface-elevated)] border border-[var(--flux-control-border)] text-sm"
            >
              {boards.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <button type="button" className="btn-primary" disabled={!selectedBoardId} onClick={() => setModalOpen(true)}>
            {t("matrixPanel.openPublish")}
          </button>
        </>
      )}
      <BoardTemplateExportModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        boardId={selectedBoardId}
        getHeaders={getHeaders}
        defaultTemplateKind="priority_matrix"
      />
    </div>
  );
}
