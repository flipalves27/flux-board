"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/context/toast-context";
import { useFluxyState } from "@/context/fluxy-presence-context";
import { FluxyAvatar } from "@/components/fluxy/fluxy-avatar";
import { useWorkspaceFluxyDockStore } from "@/stores/workspace-fluxy-dock-store";
import { AiModelHint } from "@/components/ai-model-hint";
import { FluxyDock } from "@/components/fluxy/fluxy-dock";
import { FluxySpeechBubble } from "@/components/fluxy/fluxy-speech-bubble";
import { FluxyStatusPill } from "@/components/fluxy/fluxy-status-pill";
import { fluxyVisualStateCopy } from "@/lib/fluxy-visual-state-copy";
import { trackFluxyEvent } from "@/lib/fluxy-telemetry";

function normalizeAppPath(pathname: string): string {
  return pathname.replace(/^\/(pt-BR|en)(?=\/|$)/, "") || "/";
}

function shouldRenderWorkspaceFluxy(normalizedPath: string): boolean {
  if (
    normalizedPath === "/" ||
    normalizedPath === "/login" ||
    normalizedPath === "/onboarding" ||
    normalizedPath === "/onboarding-org" ||
    normalizedPath === "/onboarding-invites" ||
    normalizedPath.startsWith("/portal/") ||
    normalizedPath.startsWith("/forms/") ||
    normalizedPath.startsWith("/embed/")
  ) {
    return false;
  }
  if (/^\/board\/[^/]+/.test(normalizedPath)) return false;
  return true;
}

function parseEventStreamFrame(frame: string): { event: string; data: unknown } | null {
  const lines = frame.split("\n").filter(Boolean);
  if (!lines.length) return null;

  let event = "message";
  const dataLines: string[] = [];

  for (const line of lines) {
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (key === "event") event = value;
    if (key === "data") dataLines.push(value);
  }

  const dataRaw = dataLines.join("\n");
  if (!dataRaw) return { event, data: {} };
  try {
    return { event, data: JSON.parse(dataRaw) };
  } catch {
    return { event, data: dataRaw };
  }
}

type Tier = "free" | "pro" | "business";

type ChatRow = {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  createdAt: string;
  meta?: Record<string, unknown>;
};

export function WorkspaceFluxyDock() {
  const pathname = usePathname();
  const locale = useLocale();
  const { user, isChecked, getHeaders } = useAuth();
  const { pushToast } = useToast();
  const t = useTranslations("appShell.workspaceFluxy");

  const hydrateFromStorage = useWorkspaceFluxyDockStore((s) => s.hydrateFromStorage);
  const dockVisible = useWorkspaceFluxyDockStore((s) => s.dockVisible);
  const hydrated = useWorkspaceFluxyDockStore((s) => s.hydrated);
  const sprintContext = useWorkspaceFluxyDockStore((s) => s.sprintContext);
  const setDockVisible = useWorkspaceFluxyDockStore((s) => s.setDockVisible);

  const [panelOpen, setPanelOpen] = useState(false);
  const titleId = useId();
  const localeRoot = `/${locale}`;

  const [messages, setMessages] = useState<ChatRow[]>([]);
  const [loadingChat, setLoadingChat] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [draft, setDraft] = useState("");
  const [tier, setTier] = useState<Tier | null>(null);
  const [freeDemoRemaining, setFreeDemoRemaining] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    hydrateFromStorage();
  }, [hydrateFromStorage]);

  const normalizedPath = normalizeAppPath(pathname);
  const show = Boolean(isChecked && user && shouldRenderWorkspaceFluxy(normalizedPath));

  const closePanel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setPanelOpen(false);
  }, []);

  useEffect(() => {
    if (!panelOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closePanel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [panelOpen, closePanel]);

  useEffect(() => {
    if (!show) setPanelOpen(false);
  }, [show, pathname]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, generating]);

  useEffect(() => {
    if (!panelOpen || !show) return;
    let cancelled = false;
    (async () => {
      setLoadingChat(true);
      try {
        const res = await fetch("/api/workspace/fluxy-chat", { headers: getHeaders() });
        if (!res.ok) return;
        const data = (await res.json()) as {
          messages?: ChatRow[];
          tier?: Tier;
          freeDemoRemaining?: number | null;
        };
        if (cancelled) return;
        setMessages(Array.isArray(data.messages) ? data.messages : []);
        setTier(data.tier ?? null);
        setFreeDemoRemaining(typeof data.freeDemoRemaining === "number" ? data.freeDemoRemaining : null);
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setLoadingChat(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [panelOpen, show, getHeaders]);

  const fluxy = useFluxyState({ isOpen: panelOpen, isGenerating: generating, source: "workspace" });

  useEffect(() => {
    trackFluxyEvent({
      event: "fluxy_state_changed",
      mode: "workspace",
      state: fluxy.visualState,
      origin: "workspace_dock",
    });
  }, [fluxy.visualState]);

  useEffect(() => {
    if (!panelOpen || !fluxy.message) return;
    trackFluxyEvent({
      event: "fluxy_proactive_message_viewed",
      mode: "workspace",
      state: fluxy.visualState,
      origin: "workspace_panel",
    });
  }, [panelOpen, fluxy.message, fluxy.visualState]);

  const demoBlocked = tier === "free" && typeof freeDemoRemaining === "number" && freeDemoRemaining <= 0;
  const canSend = !generating && draft.trim().length > 0 && !demoBlocked;

  const sendMessage = useCallback(async () => {
    const trimmed = draft.trim();
    if (!trimmed || !canSend) return;

    setGenerating(true);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const userMsg: ChatRow = {
      id: `u_${Date.now()}`,
      role: "user",
      content: trimmed,
      createdAt: new Date().toISOString(),
    };
    const assistantId = `a_${Date.now()}`;
    const assistantMsg: ChatRow = {
      id: assistantId,
      role: "assistant",
      content: "",
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setDraft("");

    try {
      const res = await fetch("/api/workspace/fluxy-chat", {
        method: "POST",
        headers: { ...getHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          ...(sprintContext ? { boardId: sprintContext.boardId, sprintId: sprintContext.sprintId } : {}),
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errBody = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(errBody?.error || `Erro ${res.status}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("Sem stream no response.");

      const decoder = new TextDecoder("utf-8");
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const frames = buffer.split("\n\n");
        buffer = frames.pop() || "";
        for (const frame of frames) {
          const parsed = parseEventStreamFrame(frame);
          if (!parsed) continue;
          const { event, data } = parsed;
          const d = data as { text?: string; message?: string; model?: string; provider?: string; source?: string };

          if (event === "error") {
            const msg = typeof d?.message === "string" ? d.message.trim() : t("streamError");
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantId ? { ...m, content: m.content || msg } : m))
            );
            pushToast({ kind: "error", title: t("toastErrorTitle"), description: msg });
            break;
          }

          if (event === "llm_meta") {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? {
                      ...m,
                      meta: {
                        ...m.meta,
                        llmModel: d.model,
                        llmProvider: d.provider,
                        llmSource: d.source,
                      },
                    }
                  : m
              )
            );
          }

          if (event === "assistant_delta" && typeof d.text === "string" && d.text) {
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantId ? { ...m, content: `${m.content}${d.text}` } : m))
            );
          }

          if (event === "chat_persisted") {
            setFreeDemoRemaining((prev) => (typeof prev === "number" ? Math.max(0, prev - 1) : prev));
          }
        }
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      const msg = e instanceof Error ? e.message : t("streamError");
      pushToast({ kind: "error", title: t("toastErrorTitle"), description: msg });
      setMessages((prev) => prev.filter((m) => m.id !== assistantId));
    } finally {
      setGenerating(false);
      abortRef.current = null;
      endRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [canSend, draft, getHeaders, pushToast, sprintContext, t]);

  const bottom = "max(1rem, env(safe-area-inset-bottom, 0px))";
  const right = "max(1rem, env(safe-area-inset-right, 0px))";

  const openPanel = () => {
    trackFluxyEvent({ event: "fluxy_dock_opened", mode: "workspace", origin: "launcher_open" });
    trackFluxyEvent({ event: "fluxy_cta_clicked", mode: "workspace", origin: "panel_open" });
    setPanelOpen(true);
  };

  const freeBanner =
    tier === "free" && freeDemoRemaining !== null ? (
      <div className="mb-3 rounded-[10px] border border-[var(--flux-warning-alpha-25)] bg-[var(--flux-warning-alpha-10)] px-3 py-2">
        <div className="text-xs font-semibold text-[var(--flux-warning)]">{t("demoTitle", { count: freeDemoRemaining })}</div>
        <div className="mt-1 text-[10px] text-[var(--flux-text-muted)]">{t("demoBody")}</div>
      </div>
    ) : null;

  return (
    <>
      <FluxyDock
        show={show}
        hydrated={hydrated}
        dockVisible={dockVisible}
        setDockVisible={setDockVisible}
        restoreContainerClassName="fixed z-[var(--flux-z-board-fluxy-dock)] motion-safe:transition-[transform,bottom] motion-safe:duration-200 max-md:max-w-[calc(100vw-2rem)]"
        launcherContainerClassName="fixed z-[var(--flux-z-board-fluxy-dock)] flex max-w-[min(100vw-2rem,280px)] flex-col gap-1.5 motion-safe:transition-[transform,bottom] motion-safe:duration-200"
        positionStyle={{ bottom, right }}
        restore={{
          label: t("restore"),
          ariaLabel: t("restoreAria"),
          avatarState: fluxy.visualState,
          buttonClassName:
            "inline-flex items-center gap-2 rounded-full border-[1.5px] border-[var(--flux-primary-alpha-28)] bg-[color-mix(in_srgb,var(--flux-surface-card)_92%,transparent)] px-2.5 py-1.5 text-[10px] font-semibold text-[var(--flux-primary-light)] shadow-[0_8px_32px_rgba(13,10,26,0.35)] backdrop-blur-[12px] font-fluxy hover:border-[var(--flux-primary)] hover:bg-[var(--flux-primary-alpha-10)] motion-safe:transition-colors",
          iconWrapperClassName:
            "fluxy-fab-bob inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--flux-chrome-alpha-14)] bg-[var(--flux-void-nested-36)] text-[var(--flux-primary-light)]",
        }}
        launcher={{
          onOpen: openPanel,
          openAriaLabel: t("fabAria"),
          openAriaExpanded: panelOpen,
          hideAriaLabel: t("hideDock"),
          hideTitle: t("hideDock"),
          avatarState: fluxy.visualState,
          containerClassName:
            "flex items-center gap-1.5 rounded-[20px] border-[1.5px] border-[var(--flux-primary-alpha-22)] bg-[linear-gradient(135deg,var(--flux-primary-alpha-14),var(--flux-secondary-alpha-08))] py-1.5 pl-1.5 pr-1.5 shadow-[0_8px_32px_rgba(108,92,231,0.2)] backdrop-blur-[12px] font-fluxy",
          openButtonClassName:
            "flex min-w-0 flex-1 items-center gap-2 rounded-[14px] px-1 py-0.5 text-left hover:bg-[var(--flux-primary-alpha-08)] motion-safe:transition-colors",
          avatarWrapperClassName:
            "fluxy-fab-bob inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] border border-[var(--flux-chrome-alpha-14)] bg-[var(--flux-void-nested-36)] text-[var(--flux-primary-light)]",
          title: t("fabLabel"),
          subtitle: t("fabHint"),
          titleClassName: "block font-fluxy text-xs font-bold leading-tight text-[var(--flux-text)]",
          subtitleClassName: "block font-fluxy text-[9px] leading-snug text-[var(--flux-text-muted)]",
        }}
        onRestoreDock={() => trackFluxyEvent({ event: "fluxy_dock_opened", mode: "workspace", origin: "restore" })}
      />

      {panelOpen && show ? (
        <div className="fixed inset-0 z-[var(--flux-z-fab-panel-backdrop)]">
          <button
            type="button"
            className="absolute inset-0 bg-[var(--flux-black-alpha-45)] backdrop-blur-[1px] motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200"
            aria-label={t("closeBackdrop")}
            onClick={closePanel}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="absolute right-[max(1rem,env(safe-area-inset-right))] top-[max(5.5rem,env(safe-area-inset-top))] bottom-[max(1rem,env(safe-area-inset-bottom))] z-10 flex w-[min(420px,calc(100vw-2rem))] flex-col overflow-hidden rounded-[20px] border-[1.5px] border-[var(--flux-primary-alpha-22)] bg-[var(--flux-surface-card)] shadow-[0_18px_60px_var(--flux-black-alpha-45)] backdrop-blur-[12px] font-fluxy motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-right-4 motion-safe:duration-200"
          >
            <div className="flex items-center justify-between gap-3 border-b border-[var(--flux-chrome-alpha-08)] px-4 py-3">
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <div className="flex min-w-0 items-center gap-2.5">
                  <FluxyAvatar
                    state={fluxy.visualState}
                    size="header"
                    className="shrink-0"
                    title={t("panelTitle")}
                    interactive
                  />
                  <div className="min-w-0">
                    <h2 id={titleId} className="font-fluxy text-sm font-bold leading-tight text-[var(--flux-primary-light)]">
                      {t("panelTitle")}
                    </h2>
                    <p className="text-[10px] text-[var(--flux-text-muted)]">{t("panelSubtitle")}</p>
                  </div>
                </div>
                <FluxyStatusPill
                  className="w-full max-w-full justify-start px-3 py-2"
                  {...fluxyVisualStateCopy(fluxy.visualState, t)}
                />
              </div>
              <button type="button" className="btn-secondary shrink-0 self-start px-3 py-1.5 text-xs" onClick={closePanel}>
                {t("close")}
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3">
              {loadingChat ? (
                <p className="text-xs text-[var(--flux-text-muted)]">{t("loadingChat")}</p>
              ) : (
                <>
                  {freeBanner}
                  {fluxy.message ? (
                    <FluxySpeechBubble className="mb-3 text-left text-xs">{fluxy.message}</FluxySpeechBubble>
                  ) : null}
                  {messages.length === 0 ? (
                    <FluxySpeechBubble className="mb-3 text-left text-xs">
                      {sprintContext ? t("emptyChatLeadSprint") : t("emptyChatLead")}
                    </FluxySpeechBubble>
                  ) : null}

                  <div className={`space-y-2 ${messages.length === 0 ? "mt-4" : ""}`}>
                    {messages.map((m) => (
                      <div
                        key={m.id}
                        className={`rounded-[10px] border px-3 py-2 ${
                          m.role === "user"
                            ? "border-[var(--flux-primary-alpha-35)] bg-[var(--flux-primary-alpha-12)]"
                            : "border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-black-alpha-12)]"
                        }`}
                      >
                        <div className="text-[10px] font-bold uppercase tracking-wide text-[var(--flux-text-muted)]">
                          {m.role === "user" ? t("roleUser") : t("roleAssistant")}
                        </div>
                        <div className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-[var(--flux-text)]">
                          {m.content ||
                            (m.role === "assistant" && generating ? t("generating") : "")}
                        </div>
                        {m.role === "assistant" && (m.meta?.llmModel || m.meta?.llmProvider) ? (
                          <div className="mt-2">
                            <AiModelHint
                              model={m.meta?.llmModel != null ? String(m.meta.llmModel) : undefined}
                              provider={m.meta?.llmProvider != null ? String(m.meta.llmProvider) : undefined}
                            />
                          </div>
                        ) : null}
                      </div>
                    ))}
                    <div ref={endRef} />
                  </div>

                  <p className="mt-6 text-[10px] font-bold uppercase tracking-wide text-[var(--flux-secondary)]">{t("linksHeading")}</p>
                  <nav className="mt-2 flex flex-col gap-2" aria-label={t("linksNavAria")}>
                    <Link
                      href={`${localeRoot}/boards`}
                      onClick={closePanel}
                      className="rounded-[var(--flux-rad-sm)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)] px-3 py-2 text-center text-xs font-semibold text-[var(--flux-text)] transition-colors hover:border-[var(--flux-primary-alpha-35)] hover:text-[var(--flux-primary-light)]"
                    >
                      {t("linkBoards")}
                    </Link>
                    <Link
                      href={`${localeRoot}/reports`}
                      onClick={closePanel}
                      className="rounded-[var(--flux-rad-sm)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)] px-3 py-2 text-center text-xs font-semibold text-[var(--flux-text)] transition-colors hover:border-[var(--flux-primary-alpha-35)] hover:text-[var(--flux-primary-light)]"
                    >
                      {t("linkReports")}
                    </Link>
                    <Link
                      href={`${localeRoot}/docs`}
                      onClick={closePanel}
                      className="rounded-[var(--flux-rad-sm)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)] px-3 py-2 text-center text-xs font-semibold text-[var(--flux-text)] transition-colors hover:border-[var(--flux-primary-alpha-35)] hover:text-[var(--flux-primary-light)]"
                    >
                      {t("linkDocs")}
                    </Link>
                    <Link
                      href={`${localeRoot}/org-settings`}
                      onClick={closePanel}
                      className="rounded-[var(--flux-rad-sm)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)] px-3 py-2 text-center text-xs font-semibold text-[var(--flux-text)] transition-colors hover:border-[var(--flux-primary-alpha-35)] hover:text-[var(--flux-primary-light)]"
                    >
                      {t("linkOrgSettings")}
                    </Link>
                  </nav>
                </>
              )}
            </div>

            <div className="border-t border-[var(--flux-chrome-alpha-08)] px-4 py-3">
              <div className="flex gap-2">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={sprintContext ? t("chatPlaceholderSprint") : t("chatPlaceholder")}
                  rows={2}
                  disabled={generating || (tier === "free" && freeDemoRemaining === 0)}
                  className="min-h-[44px] flex-1 resize-none rounded-[10px] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-mid)] px-3 py-2 text-xs text-[var(--flux-text)] outline-none focus:border-[var(--flux-primary)] disabled:opacity-60"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void sendMessage();
                    }
                  }}
                />
                <button
                  type="button"
                  className={`btn-primary shrink-0 self-end px-3 py-2 text-xs ${!canSend ? "!opacity-50" : ""}`}
                  disabled={!canSend}
                  onClick={() => void sendMessage()}
                >
                  {generating ? "…" : t("send")}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
