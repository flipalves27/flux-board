import type { HTMLAttributes } from "react";

function cx(...parts: Array<string | false | undefined>) {
  return parts.filter(Boolean).join(" ");
}

const skeletonBase =
  "rounded-[var(--flux-rad-sm)] bg-[var(--flux-chrome-alpha-12)] flux-animate-skeleton-pulse";

export function Skeleton({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx(skeletonBase, className)} {...rest} />;
}

/** Kanban card–sized block */
export function SkeletonCard({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cx(
        "flex min-h-[88px] flex-col gap-2 rounded-[var(--flux-rad)] border border-[var(--flux-primary-alpha-15)] bg-[var(--flux-surface-card)] p-3",
        className
      )}
      {...rest}
    >
      <Skeleton className="h-3 w-[min(100%,220px)]" />
      <Skeleton className="h-2 w-full max-w-[180px]" />
      <Skeleton className="mt-auto h-2 w-full" />
    </div>
  );
}

/** Single Kanban column */
export function SkeletonColumn({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cx(
        "flex min-w-[260px] max-w-[320px] flex-1 flex-col gap-2 rounded-[var(--flux-rad)] border border-[var(--flux-chrome-alpha-10)] bg-[var(--flux-surface-card)]/90 p-3 shadow-[var(--flux-shadow-kanban-column)]",
        className
      )}
      {...rest}
    >
      <Skeleton className="h-4 w-[min(100%,140px)]" />
      <Skeleton className="h-2 w-full max-w-[100px]" />
      <div className="mt-2 flex flex-col gap-2">
        <SkeletonCard className="min-h-[76px] border-[var(--flux-chrome-alpha-08)]" />
        <SkeletonCard className="min-h-[76px] border-[var(--flux-chrome-alpha-08)]" />
        <SkeletonCard className="min-h-[76px] border-[var(--flux-chrome-alpha-08)]" />
      </div>
    </div>
  );
}

/** Boards list: stats strip + card grid (matches boards page rhythm) */
export function SkeletonBoardList({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx("space-y-6", className)} {...rest}>
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="rounded-[var(--flux-rad)] border border-[var(--flux-chrome-alpha-10)] bg-[var(--flux-surface-card)] p-4"
          >
            <Skeleton className="mb-2 h-2 w-24" />
            <Skeleton className="h-8 w-16" />
          </div>
        ))}
      </div>
      <div className="rounded-[var(--flux-rad)] border border-[var(--flux-primary-alpha-18)] bg-[var(--flux-surface-card)] p-5">
        <Skeleton className="mb-2 h-3 w-48" />
        <Skeleton className="mb-4 h-2 max-w-xl" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-[var(--flux-rad)] border border-[var(--flux-chrome-alpha-08)] p-4">
              <Skeleton className="mb-2 h-2 w-20" />
              <Skeleton className="h-9 w-14" />
            </div>
          ))}
        </div>
      </div>
      <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto_auto_auto]">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full md:w-[140px]" />
        <Skeleton className="h-10 w-full md:w-[120px]" />
        <Skeleton className="h-10 w-full md:w-[120px]" />
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
        <Skeleton className="min-h-[120px] rounded-[var(--flux-rad)] border-2 border-dashed border-[var(--flux-primary-alpha-22)] bg-[var(--flux-surface-card)]" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="flex min-h-[168px] flex-col gap-3 rounded-[var(--flux-rad)] border border-[var(--flux-primary-alpha-18)] bg-[var(--flux-surface-card)] p-5"
          >
            <Skeleton className="h-4 w-[min(100%,200px)]" />
            <Skeleton className="h-2 w-full" />
            <Skeleton className="h-2 w-[80%]" />
            <Skeleton className="mt-auto h-8 w-full max-w-[160px]" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Table / dense dashboard blocks */
export function SkeletonTable({
  rows = 6,
  className,
  ...rest
}: { rows?: number } & HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx("space-y-3", className)} {...rest}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-[var(--flux-rad)] border border-[var(--flux-chrome-alpha-10)] bg-[var(--flux-surface-card)] p-4"
          >
            <Skeleton className="mb-2 h-2 w-28" />
            <Skeleton className="h-8 w-20" />
          </div>
        ))}
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="rounded-[var(--flux-rad)] border border-[var(--flux-primary-alpha-15)] bg-[var(--flux-surface-card)] p-4"
        >
          <Skeleton className="mb-2 h-3 w-[min(100%,320px)]" />
          <Skeleton className="h-[200px] w-full max-w-full" />
        </div>
      ))}
    </div>
  );
}

/** Kanban board chrome + columns */
export function SkeletonKanbanBoard({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx("w-full px-4 pb-8 pt-2 md:px-6", className)} {...rest}>
      <div className="mb-4 flex gap-2 overflow-x-auto pb-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-[100px] shrink-0 rounded-full" />
        ))}
      </div>
      <div className="flex gap-3 overflow-x-auto pb-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonColumn key={i} />
        ))}
      </div>
    </div>
  );
}
