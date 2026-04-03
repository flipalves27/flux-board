"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { FluxyAvatar } from "@/components/fluxy/fluxy-avatar";
import { FluxySpeechBubble } from "@/components/fluxy/fluxy-speech-bubble";
import { FluxyStatusPill } from "@/components/fluxy/fluxy-status-pill";
import { fluxyVisualStateCopy } from "@/lib/fluxy-visual-state-copy";
import type { FluxyAvatarState } from "@/components/fluxy/fluxy-types";
import { matchLandingFaq } from "@/lib/landing-faq-match";
import { LANDING_OPEN_FLUXY_CHAT_EVENT } from "@/lib/landing-open-fluxy-chat";

type ChatLine = {
  id: string;
  role: "user" | "assistant";
  content: string;
  faqAnchorIndex?: number;
};

/** Floating action button — opens the landing Fluxy drawer. */
export function LandingFluxyFab({
  panelOpen,
  onToggle,
  fabTitle,
  fabSubtitle,
  ariaLabel,
}: {
  panelOpen: boolean;
  onToggle: () => void;
  fabTitle: string;
  fabSubtitle: string;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="group flex items-center gap-2 rounded-[var(--flux-marketing-radius)] border-2 border-[var(--flux-secondary-alpha-28)] bg-gradient-to-br from-[var(--flux-primary-alpha-20)] to-[var(--flux-secondary-alpha-10)] py-2 pl-2 pr-4 shadow-[0_6px_24px_var(--flux-primary-alpha-22)] backdrop-blur-[20px] motion-safe:transition-all motion-safe:duration-300 motion-safe:ease-out hover:-translate-y-0.5 hover:shadow-[0_10px_36px_var(--flux-primary-alpha-35)] hover:border-[var(--flux-secondary-alpha-40)] active:translate-y-0 md:pr-5"
      aria-expanded={panelOpen}
      aria-label={ariaLabel}
    >
      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border-2 border-[color-mix(in_srgb,white_15%,transparent)] bg-gradient-to-br from-[var(--flux-primary)] to-[var(--flux-secondary)] leading-none shadow-[var(--flux-shadow-primary-dot-sm)] md:h-11 md:w-11">
        <FluxyAvatar state="idle" size="fab" className="[&_svg]:drop-shadow-sm" />
      </span>
      <span className="hidden min-w-0 text-left md:block">
        <span className="block font-display text-[0.78rem] font-semibold tracking-wide text-[var(--flux-text)]">{fabTitle}</span>
        <span className="block text-[0.62rem] font-normal text-[var(--flux-text-muted)]">{fabSubtitle}</span>
      </span>
    </button>
  );
}

/** Drawer with messages, quick actions, and LLM/FAQ replies. */
export function LandingFluxyChatDrawer({
  panelOpen,
  onClose,
  title,
  subtitle,
  fluxyState,
  lines,
  draft,
  onDraftChange,
  onSubmit,
  onQuickAsk,
  emptyHint,
  listEndRef,
  scrollToFaq,
  placeholder,
  sendLabel,
  minimizeLabel,
  quickLabels,
}: {
  panelOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle: string;
  fluxyState: Extract<FluxyAvatarState, "idle" | "thinking" | "talking" | "error">;
  lines: ChatLine[];
  draft: string;
  onDraftChange: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onQuickAsk: (q: string) => void;
  emptyHint: string;
  listEndRef: React.RefObject<HTMLDivElement | null>;
  scrollToFaq: (index: number) => void;
  placeholder: string;
  sendLabel: string;
  minimizeLabel: string;
  quickLabels: string[];
}) {
  const t = useTranslations("landing");

  if (!panelOpen) return null;

  return (
    <div
      className="flex w-[min(100vw-2rem,400px)] flex-col overflow-hidden rounded-[var(--rad-xl)] border-[1.5px] border-[var(--primary-dim)] bg-[var(--bg-card)] font-body shadow-[var(--flux-shadow-modal-depth)] backdrop-blur-[14px]"
      role="dialog"
      aria-label={title}
    >
      <div className="flex flex-col gap-2 border-b border-[var(--border)] px-4 py-3">
        <div className="flex items-center gap-3">
          <FluxyAvatar
            state={
              fluxyState === "thinking"
                ? "thinking"
                : fluxyState === "talking"
                  ? "talking"
                  : fluxyState === "error"
                    ? "error"
                    : "idle"
            }
            size="header"
            interactive
          />
          <div className="min-w-0 flex-1">
            <div className="font-display text-sm font-bold text-[var(--flux-text)]">{title}</div>
            <div className="text-[11px] text-[var(--text-dim)]">{subtitle}</div>
          </div>
          <button
            type="button"
            className="btn-secondary shrink-0 px-2 py-1.5 text-[10px]"
            onClick={onClose}
            aria-label={minimizeLabel}
          >
            —
          </button>
        </div>
        <FluxyStatusPill
          className="w-full justify-start px-3 py-2"
          {...fluxyVisualStateCopy(fluxyState, (key) => t(`fluxyChat.${key}`))}
        />
      </div>

      <div className="max-h-[min(52vh,420px)] space-y-2 overflow-y-auto px-3 py-3 scrollbar-flux">
        {lines.length === 0 && quickLabels.length > 0 && (
          <div className="flex flex-wrap gap-2 pb-1">
            {quickLabels.map((label) => (
              <button
                key={label}
                type="button"
                className="rounded-full border border-[var(--flux-primary-alpha-20)] bg-[var(--flux-primary-alpha-08)] px-3 py-1.5 text-left text-[11px] font-medium text-[var(--flux-text-muted)] transition-colors hover:border-[var(--flux-primary-alpha-35)] hover:text-[var(--flux-text)]"
                onClick={() => onQuickAsk(label)}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        {lines.length === 0 ? (
          <FluxySpeechBubble className="text-left text-xs">{emptyHint}</FluxySpeechBubble>
        ) : (
          lines.map((line) => (
            <div
              key={line.id}
              className={`rounded-[var(--rad-lg)] border px-3 py-2 text-xs leading-relaxed ${
                line.role === "user"
                  ? "border-[var(--flux-primary-alpha-35)] bg-[var(--flux-primary-alpha-10)] text-[var(--flux-text)]"
                  : "border-[var(--border)] bg-[var(--flux-black-alpha-12)] text-[var(--text-dim)]"
              }`}
            >
              <div className="text-[9px] font-bold uppercase tracking-wide text-[var(--text-dim)]">
                {line.role === "user" ? t("fluxyChat.you") : t("fluxyChat.fluxy")}
              </div>
              <p className="mt-1 whitespace-pre-wrap">{line.content}</p>
              {line.role === "assistant" && line.faqAnchorIndex !== undefined ? (
                <button
                  type="button"
                  className="mt-2 text-[11px] font-semibold text-[var(--flux-secondary)] underline-offset-2 hover:underline"
                  onClick={() => scrollToFaq(line.faqAnchorIndex!)}
                >
                  {t("fluxyChat.seeFaq")}
                </button>
              ) : null}
            </div>
          ))
        )}
        <div ref={listEndRef} />
      </div>

      <form className="flex gap-2 border-t border-[var(--border)] p-3" onSubmit={onSubmit}>
        <input
          type="text"
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          placeholder={placeholder}
          className="min-w-0 flex-1 rounded-[var(--rad-md)] border border-[var(--border)] bg-[var(--bg-raised)] px-3 py-2 text-sm text-[var(--flux-text)] outline-none focus:border-[var(--flux-primary)]"
          aria-label={placeholder}
        />
        <button type="submit" className="btn-primary shrink-0 px-4 py-2 text-xs">
          {sendLabel}
        </button>
      </form>
    </div>
  );
}

export function LandingFluxyFaqChat() {
  const t = useTranslations("landing");
  const pathname = usePathname();
  const localeSegment = pathname.split("/")[1];
  const locale = localeSegment === "en" ? "en" : "pt-BR";

  const faqItems = useMemo(
    () =>
      [1, 2, 3, 4, 5, 6, 7].map((n) => ({
        question: t(`faq.q${n}`),
        answer: t(`faq.a${n}`),
      })),
    [t]
  );

  const [panelOpen, setPanelOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [lines, setLines] = useState<ChatLine[]>([]);
  const [fluxyState, setFluxyState] = useState<Extract<FluxyAvatarState, "idle" | "thinking" | "talking" | "error">>("idle");
  const [llmEnabled, setLlmEnabled] = useState<boolean | null>(null);
  const listEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/fluxy")
      .then((r) => r.json())
      .then((d: { llmEnabled?: boolean }) => {
        if (!cancelled && typeof d?.llmEnabled === "boolean") setLlmEnabled(d.llmEnabled);
      })
      .catch(() => {
        if (!cancelled) setLlmEnabled(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!panelOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPanelOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [panelOpen]);

  useEffect(() => {
    const onOpen = () => setPanelOpen(true);
    window.addEventListener(LANDING_OPEN_FLUXY_CHAT_EVENT, onOpen);
    return () => window.removeEventListener(LANDING_OPEN_FLUXY_CHAT_EVENT, onOpen);
  }, []);

  const suggestionQuestions = useMemo(() => faqItems.slice(0, 3).map((x) => x.question), [faqItems]);

  const quickLabels = useMemo(
    () => [t("fluxyChat.quickAsk1"), t("fluxyChat.quickAsk2"), t("fluxyChat.quickAsk3")],
    [t]
  );

  const subtitle = llmEnabled ? t("fluxyChat.subtitleLlm") : t("fluxyChat.subtitle");
  const emptyHint = llmEnabled ? t("fluxyChat.emptyHintLlm") : t("fluxyChat.emptyHint");

  const scrollToFaq = useCallback((index: number) => {
    const el = document.getElementById(`landing-faq-${index}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  const applyFaqFallback = useCallback(
    (trimmed: string, historyAfterUser: ChatLine[]) => {
      const hit = matchLandingFaq(trimmed, faqItems);
      if (hit) {
        const item = faqItems[hit.bestIndex];
        setLines([
          ...historyAfterUser,
          {
            id: `a_${Date.now()}`,
            role: "assistant",
            content: item.answer,
            faqAnchorIndex: hit.bestIndex,
          },
        ]);
        setFluxyState("talking");
        window.setTimeout(() => setFluxyState("idle"), 600);
        return;
      }
      const extra = suggestionQuestions.map((q) => `• ${q}`).join("\n");
      setLines([
        ...historyAfterUser,
        {
          id: `a_${Date.now()}`,
          role: "assistant",
          content: `${t("fluxyChat.noMatch")}\n\n${t("fluxyChat.suggestionsIntro")}\n${extra}`,
        },
      ]);
      setFluxyState("idle");
    },
    [faqItems, suggestionQuestions, t]
  );

  const processReply = useCallback(
    async (history: ChatLine[]) => {
      const last = history[history.length - 1];
      if (!last || last.role !== "user") return;
      const trimmed = last.content;

      if (llmEnabled) {
        try {
          const res = await fetch("/api/fluxy", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              locale,
              messages: history.map((l) => ({ role: l.role, content: l.content })),
            }),
          });
          if (res.status === 429) {
            setLines((prev) => [
              ...prev,
              {
                id: `a_${Date.now()}`,
                role: "assistant",
                content: t("fluxyChat.rateLimited"),
              },
            ]);
            setFluxyState("idle");
            return;
          }
          if (!res.ok) {
            setLines((prev) => [
              ...prev,
              {
                id: `a_${Date.now()}`,
                role: "assistant",
                content: t("fluxyChat.visualState.error.desc"),
              },
            ]);
            setFluxyState("error");
            window.setTimeout(() => setFluxyState("idle"), 2500);
            return;
          }
          const data = (await res.json().catch(() => ({}))) as {
            mode?: string;
            text?: string;
            error?: string;
          };
          if (data?.mode === "llm" && typeof data.text === "string" && data.text.trim()) {
            setLines((prev) => [
              ...prev,
              { id: `a_${Date.now()}`, role: "assistant", content: data.text!.trim() },
            ]);
            setFluxyState("talking");
            window.setTimeout(() => setFluxyState("idle"), 800);
            return;
          }
        } catch {
          /* FAQ fallback */
        }
      }

      window.setTimeout(() => applyFaqFallback(trimmed, history), 120);
    },
    [applyFaqFallback, llmEnabled, locale, t]
  );

  const sendQuestion = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      const userLine: ChatLine = {
        id: `u_${Date.now()}`,
        role: "user",
        content: trimmed,
      };
      setDraft("");
      setFluxyState("thinking");
      setLines((prev) => {
        const next = [...prev, userLine];
        void processReply(next);
        return next;
      });
    },
    [processReply]
  );

  useEffect(() => {
    if (!panelOpen) return;
    listEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [lines, panelOpen]);

  return (
    <div
      className="fixed z-[var(--flux-z-landing-fluxy-chat)] flex flex-col items-end gap-2"
      style={{
        bottom: "max(1.25rem, env(safe-area-inset-bottom, 0px))",
        right: "max(1.25rem, env(safe-area-inset-right, 0px))",
      }}
    >
      <LandingFluxyChatDrawer
        panelOpen={panelOpen}
        onClose={() => setPanelOpen(false)}
        title={t("fluxyChat.title")}
        subtitle={subtitle}
        fluxyState={fluxyState}
        lines={lines}
        draft={draft}
        onDraftChange={setDraft}
        onSubmit={(e) => {
          e.preventDefault();
          sendQuestion(draft);
        }}
        onQuickAsk={sendQuestion}
        emptyHint={emptyHint}
        listEndRef={listEndRef}
        scrollToFaq={scrollToFaq}
        placeholder={t("fluxyChat.placeholder")}
        sendLabel={t("fluxyChat.send")}
        minimizeLabel={t("fluxyChat.minimize")}
        quickLabels={quickLabels}
      />

      <LandingFluxyFab
        panelOpen={panelOpen}
        onToggle={() => setPanelOpen((o) => !o)}
        fabTitle={t("fluxyChat.fabTitle")}
        fabSubtitle={t("fluxyChat.fabSubtitle")}
        ariaLabel={panelOpen ? t("fluxyChat.close") : t("fluxyChat.open")}
      />
    </div>
  );
}
