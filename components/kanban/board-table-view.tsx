"use client";

import { useEffect, useMemo, useState } from "react";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type Row,
  type SortingState,
} from "@tanstack/react-table";
import type { CardData, BucketConfig } from "@/app/board/[id]/page";
import { useTranslations } from "next-intl";

export interface BoardTableViewProps {
  cards: CardData[];
  buckets: BucketConfig[];
  filterCard: (c: CardData) => boolean;
  priorities: string[];
  onPatchCard: (
    cardId: string,
    patch: Partial<Pick<CardData, "title" | "priority" | "dueDate" | "bucket" | "tags">>
  ) => void;
  onOpenCard: (card: CardData) => void;
}

const columnHelper = createColumnHelper<CardData>();

function SortHeader({
  label,
  canSort,
  sorted,
  onToggle,
}: {
  label: string;
  canSort: boolean;
  sorted: false | "asc" | "desc";
  onToggle?: (e: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  if (!canSort) {
    return <span className="text-[10px] font-bold uppercase tracking-wider">{label}</span>;
  }
  return (
    <button
      type="button"
      onClick={onToggle}
      className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-left hover:text-[var(--flux-primary-light)] transition-colors"
    >
      {label}
      <span className="tabular-nums opacity-70" aria-hidden>
        {sorted === "asc" ? "▲" : sorted === "desc" ? "▼" : ""}
      </span>
    </button>
  );
}

function TitleCell({
  row,
  onPatch,
}: {
  row: Row<CardData>;
  onPatch: BoardTableViewProps["onPatchCard"];
}) {
  const [v, setV] = useState(row.original.title);
  useEffect(() => {
    setV(row.original.title);
  }, [row.original.id, row.original.title]);
  return (
    <input
      type="text"
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => {
        const next = v.trim();
        if (next && next !== row.original.title) onPatch(row.original.id, { title: next });
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      className="w-full min-w-[140px] max-w-[min(100%,420px)] px-2 py-1 rounded-md border border-transparent bg-transparent text-xs text-[var(--flux-text)] hover:border-[var(--flux-chrome-alpha-12)] focus:border-[var(--flux-primary)] focus:ring-1 focus:ring-[var(--flux-primary-alpha-25)] outline-none"
    />
  );
}

function PriorityCell({
  row,
  priorities,
  onPatch,
}: {
  row: Row<CardData>;
  priorities: string[];
  onPatch: BoardTableViewProps["onPatchCard"];
}) {
  const cur = row.original.priority;
  const hasCur = priorities.includes(cur);
  return (
    <select
      value={cur}
      onChange={(e) => onPatch(row.original.id, { priority: e.target.value })}
      className="max-w-full px-2 py-1 rounded-md border border-[var(--flux-control-border)] text-xs bg-[var(--flux-surface-elevated)] text-[var(--flux-text)] focus:border-[var(--flux-primary)] outline-none cursor-pointer"
    >
      {!hasCur ? (
        <option value={cur}>
          {cur}
        </option>
      ) : null}
      {priorities.map((p) => (
        <option key={p} value={p}>
          {p}
        </option>
      ))}
    </select>
  );
}

function DueCell({
  row,
  onPatch,
}: {
  row: Row<CardData>;
  onPatch: BoardTableViewProps["onPatchCard"];
}) {
  const v = row.original.dueDate ?? "";
  return (
    <input
      type="date"
      value={v}
      onChange={(e) => onPatch(row.original.id, { dueDate: e.target.value || null })}
      className="w-[min(100%,148px)] px-2 py-1 rounded-md border border-[var(--flux-control-border)] text-xs bg-[var(--flux-surface-elevated)] text-[var(--flux-text)] focus:border-[var(--flux-primary)] outline-none"
    />
  );
}

function BucketCell({
  row,
  buckets,
  onPatch,
}: {
  row: Row<CardData>;
  buckets: BucketConfig[];
  onPatch: BoardTableViewProps["onPatchCard"];
}) {
  return (
    <select
      value={row.original.bucket}
      onChange={(e) => onPatch(row.original.id, { bucket: e.target.value })}
      className="max-w-full min-w-[120px] px-2 py-1 rounded-md border border-[var(--flux-control-border)] text-xs bg-[var(--flux-surface-elevated)] text-[var(--flux-text)] focus:border-[var(--flux-primary)] outline-none cursor-pointer"
    >
      {buckets.map((b) => (
        <option key={b.key} value={b.key}>
          {b.label}
        </option>
      ))}
    </select>
  );
}

function TagsCell({
  row,
  onPatch,
}: {
  row: Row<CardData>;
  onPatch: BoardTableViewProps["onPatchCard"];
}) {
  const [v, setV] = useState(() => row.original.tags.join(", "));
  useEffect(() => {
    setV(row.original.tags.join(", "));
  }, [row.original.id, row.original.tags]);
  return (
    <input
      type="text"
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => {
        const next = v
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
          .slice(0, 20);
        const prev = row.original.tags.join(", ");
        if (next.join(", ") !== prev) onPatch(row.original.id, { tags: next });
      }}
      placeholder="tag1, tag2"
      className="w-full min-w-[160px] px-2 py-1 rounded-md border border-transparent bg-transparent text-xs text-[var(--flux-text)] hover:border-[var(--flux-chrome-alpha-12)] focus:border-[var(--flux-primary)] focus:ring-1 focus:ring-[var(--flux-primary-alpha-25)] outline-none"
    />
  );
}

export function BoardTableView({
  cards,
  buckets,
  filterCard,
  priorities,
  onPatchCard,
  onOpenCard,
}: BoardTableViewProps) {
  const t = useTranslations("kanban.board.table");
  const data = useMemo(() => cards.filter(filterCard), [cards, filterCard]);
  const [sorting, setSorting] = useState<SortingState>([{ id: "title", desc: false }]);

  const columns = useMemo(
    () => [
      columnHelper.display({
        id: "open",
        header: () => <span className="sr-only">{t("openRow")}</span>,
        enableSorting: false,
        cell: ({ row }) => (
          <button
            type="button"
            onClick={() => onOpenCard(row.original)}
            className="text-[11px] font-semibold text-[var(--flux-primary)] hover:underline whitespace-nowrap"
          >
            {t("open")}
          </button>
        ),
        size: 56,
      }),
      columnHelper.accessor("title", {
        id: "title",
        header: t("colTitle"),
        sortingFn: "alphanumeric",
        cell: ({ row }) => <TitleCell row={row} onPatch={onPatchCard} />,
      }),
      columnHelper.accessor("priority", {
        id: "priority",
        header: t("colPriority"),
        sortingFn: "alphanumeric",
        cell: ({ row }) => <PriorityCell row={row} priorities={priorities} onPatch={onPatchCard} />,
      }),
      columnHelper.accessor((row) => row.dueDate ?? "", {
        id: "dueDate",
        header: t("colDue"),
        sortingFn: (a, b) => {
          const va = a.original.dueDate ?? "";
          const vb = b.original.dueDate ?? "";
          if (!va && !vb) return 0;
          if (!va) return 1;
          if (!vb) return -1;
          return va.localeCompare(vb);
        },
        cell: ({ row }) => <DueCell row={row} onPatch={onPatchCard} />,
      }),
      columnHelper.accessor("bucket", {
        id: "bucket",
        header: t("colColumn"),
        sortingFn: "alphanumeric",
        cell: ({ row }) => <BucketCell row={row} buckets={buckets} onPatch={onPatchCard} />,
      }),
      columnHelper.accessor((row) => row.tags.join(", ").toLowerCase(), {
        id: "tags",
        header: t("colTags"),
        sortingFn: "alphanumeric",
        cell: ({ row }) => <TagsCell row={row} onPatch={onPatchCard} />,
      }),
    ],
    [t, buckets, priorities, onPatchCard, onOpenCard]
  );

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: (row) => row.id,
  });

  if (data.length === 0) {
    return (
      <div className="w-full py-12 flex flex-col items-center justify-center text-center border border-dashed border-[var(--flux-primary-alpha-25)] rounded-[var(--flux-rad)] bg-[var(--flux-black-alpha-12)]">
        <p className="text-sm font-display font-semibold text-[var(--flux-text)]">{t("emptyTitle")}</p>
        <p className="mt-2 text-xs text-[var(--flux-text-muted)] max-w-md">{t("emptyHint")}</p>
      </div>
    );
  }

  return (
    <div className="w-full py-4 pb-6 overflow-x-auto scrollbar-flux min-h-[calc(100vh-200px)]">
      <div className="inline-block min-w-full rounded-[var(--flux-rad)] border border-[var(--flux-chrome-alpha-08)] bg-[var(--flux-surface-mid)] overflow-hidden">
        <table className="w-full border-collapse text-left">
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="border-b border-[var(--flux-chrome-alpha-08)] bg-[var(--flux-black-alpha-15)]">
                {hg.headers.map((header) => {
                  const sorted = header.column.getIsSorted();
                  const def = header.column.columnDef;
                  const headerNode =
                    typeof def.header === "string" ? (
                      <SortHeader
                        label={def.header}
                        canSort={header.column.getCanSort()}
                        sorted={sorted}
                        onToggle={header.column.getToggleSortingHandler()}
                      />
                    ) : (
                      flexRender(def.header, header.getContext())
                    );
                  return (
                    <th
                      key={header.id}
                      className="px-3 py-2.5 text-[var(--flux-text-muted)] align-middle"
                      style={{ width: header.getSize() > 0 ? header.getSize() : undefined }}
                    >
                      {header.isPlaceholder ? null : headerNode}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr
                key={row.id}
                className="border-b border-[var(--flux-chrome-alpha-05)] hover:bg-[var(--flux-primary-alpha-06)] transition-colors"
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-3 py-2 align-middle">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
