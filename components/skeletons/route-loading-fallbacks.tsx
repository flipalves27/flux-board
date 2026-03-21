"use client";

import { Header } from "@/components/header";
import {
  Skeleton,
  SkeletonBoardList,
  SkeletonKanbanBoard,
  SkeletonTable,
} from "@/components/skeletons/flux-skeletons";

export function BoardsRouteLoadingFallback() {
  return (
    <div className="min-h-screen bg-[var(--flux-surface-dark)]">
      <Header hideDiscovery />
      <main className="mx-auto max-w-[1200px] px-6 py-8">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="h-7 w-40 rounded-[var(--flux-rad-sm)] bg-[var(--flux-chrome-alpha-12)] flux-animate-skeleton-pulse" />
          <div className="flex gap-2">
            <div className="h-9 w-32 rounded-[var(--flux-rad)] bg-[var(--flux-chrome-alpha-12)] flux-animate-skeleton-pulse" />
            <div className="h-9 w-36 rounded-[var(--flux-rad)] bg-[var(--flux-chrome-alpha-12)] flux-animate-skeleton-pulse" />
          </div>
        </div>
        <div className="mb-6 h-14 w-full max-w-3xl rounded-[var(--flux-rad)] bg-[var(--flux-chrome-alpha-10)] flux-animate-skeleton-pulse" />
        <SkeletonBoardList />
      </main>
    </div>
  );
}

export function BoardRouteLoadingFallback() {
  return (
    <div className="min-h-screen bg-[var(--flux-surface-dark)]">
      <Header title="Board">
        <div className="flex flex-wrap justify-end gap-2">
          <div className="h-8 w-24 rounded-[var(--flux-rad)] bg-[var(--flux-chrome-alpha-12)] flux-animate-skeleton-pulse" />
          <div className="h-8 w-24 rounded-[var(--flux-rad)] bg-[var(--flux-chrome-alpha-12)] flux-animate-skeleton-pulse" />
        </div>
      </Header>
      <SkeletonKanbanBoard />
    </div>
  );
}

export function ReportsRouteLoadingFallback() {
  return (
    <div className="min-h-screen bg-[var(--flux-surface-dark)]">
      <Header hideDiscovery />
      <main className="mx-auto max-w-[1200px] px-6 py-8">
        <div className="mb-6 space-y-2">
          <div className="h-3 w-28 rounded bg-[var(--flux-chrome-alpha-12)] flux-animate-skeleton-pulse" />
          <div className="h-7 w-64 max-w-full rounded bg-[var(--flux-chrome-alpha-12)] flux-animate-skeleton-pulse" />
          <div className="h-4 max-w-3xl rounded bg-[var(--flux-chrome-alpha-10)] flux-animate-skeleton-pulse" />
        </div>
        <SkeletonTable rows={5} />
      </main>
    </div>
  );
}

/** Main grid only — pair with Header on the real page to avoid duplicate chrome. */
export function OkrsPageContentSkeleton() {
  return (
    <main className="mx-auto grid max-w-[1300px] grid-cols-1 gap-6 px-6 py-7 xl:grid-cols-[1fr,420px]">
      <section className="rounded-[var(--flux-rad-lg)] border border-[var(--flux-primary-alpha-18)] bg-[var(--flux-surface-card)] p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="h-6 w-48 rounded bg-[var(--flux-chrome-alpha-12)] flux-animate-skeleton-pulse" />
          <div className="h-10 w-40 rounded bg-[var(--flux-chrome-alpha-12)] flux-animate-skeleton-pulse" />
        </div>
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="h-10 w-full rounded-[var(--flux-rad)] bg-[var(--flux-chrome-alpha-12)] flux-animate-skeleton-pulse" />
          <div className="h-20 w-full rounded-[var(--flux-rad)] bg-[var(--flux-chrome-alpha-10)] flux-animate-skeleton-pulse" />
        </div>
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="rounded-[var(--flux-rad)] border border-[var(--flux-primary-alpha-15)] bg-[var(--flux-primary-alpha-06)] p-4"
            >
              <Skeleton className="mb-2 h-4 w-[min(100%,280px)]" />
              <Skeleton className="h-2 w-full max-w-md" />
              <Skeleton className="mt-3 h-2 w-full" />
            </div>
          ))}
        </div>
      </section>
      <aside className="space-y-4 rounded-[var(--flux-rad-lg)] border border-[var(--flux-primary-alpha-18)] bg-[var(--flux-surface-card)] p-5">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </aside>
    </main>
  );
}

export function OkrsRouteLoadingFallback() {
  return (
    <div className="min-h-screen bg-[var(--flux-surface-dark)]">
      <Header title="Flux Goals (OKRs)" />
      <OkrsPageContentSkeleton />
    </div>
  );
}
