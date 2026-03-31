"use client";

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

export function LandingFluxyFaqChat() {
  const t = useTranslations("landing");

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
  const [fluxyState, setFluxyState] = useState<Extract<FluxyAvatarState, "idle" | "thinking" | "talking">>("idle");
  const listEndRef = useRef<HTMLDivElement | null>(null);

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

  const scrollToFaq = useCallback((index: number) => {
    const el = document.getElementById(`landing-faq-${index}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  const sendQuestion = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      const userLine: ChatLine = {
        id: `u_${Date.now()}`,
        role: "user",
        content: trimmed,
      };
      setLines((prev) => [...prev, userLine]);
      setDraft("");
      setFluxyState("thinking");

      window.setTimeout(() => {
        const hit = matchLandingFaq(trimmed, faqItems);
        if (hit) {
          const item = faqItems[hit.bestIndex];
          setLines((prev) => [
            ...prev,
            {
              id: `a_${Date.now()}`,
              role: "assistant",
              content: item.answer,
              faqAnchorIndex: hit.bestIndex,
            },
          ]);
          setFluxyState("talking");
          window.setTimeout(() => setFluxyState("idle"), 600);
        } else {
          const extra = suggestionQuestions.map((q) => `• ${q}`).join("\n");
          setLines((prev) => [
            ...prev,
            {
              id: `a_${Date.now()}`,
              role: "assistant",
              content: `${t("fluxyChat.noMatch")}\n\n${t("fluxyChat.suggestionsIntro")}\n${extra}`,
            },
          ]);
          setFluxyState("idle");
        }
        listEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
      }, 380);
    },
    [faqItems, suggestionQuestions, t]
  );

  return (
    <div
      className="fixed z-[var(--flux-z-landing-fluxy-chat)] flex flex-col items-end gap-2"
      style={{
        bottom: "max(1.25rem, env(safe-area-inset-bottom, 0px))",
        right: "max(1.25rem, env(safe-area-inset-right, 0px))",
      }}
    >
      {panelOpen ? (
        <div
          className="flex w-[min(100vw-2rem,400px)] flex-col overflow-hidden rounded-[20px] border-[1.5px] border-[var(--flux-primary-alpha-28)] bg-[var(--flux-surface-card)] font-fluxy shadow-[var(--flux-shadow-modal-depth)] backdrop-blur-[12px]"
          role="dialog"
          aria-label={t("fluxyChat.title")}
        >
          <div className="flex flex-col gap-2 border-b border-[var(--flux-chrome-alpha-10)] px-4 py-3">
            <div className="flex items-center gap-3">
              <FluxyAvatar
                state={fluxyState === "thinking" ? "thinking" : fluxyState === "talking" ? "talking" : "idle"}
                size="header"
                interactive
              />
              <div className="min-w-0 flex-1">
                <div className="font-fluxy text-sm font-bold text-[var(--flux-text)]">{t("fluxyChat.title")}</div>
                <div className="text-[11px] text-[var(--flux-text-muted)]">{t("fluxyChat.subtitle")}</div>
              </div>
              <button
                type="button"
                className="btn-secondary shrink-0 px-2 py-1.5 text-[10px]"
                onClick={() => setPanelOpen(false)}
                aria-label={t("fluxyChat.minimize")}
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
            {lines.length === 0 ? (
              <FluxySpeechBubble className="text-left text-xs">{t("fluxyChat.emptyHint")}</FluxySpeechBubble>
            ) : (
              lines.map((line) => (
                <div
                  key={line.id}
                  className={`rounded-[12px] border px-3 py-2 text-xs leading-relaxed ${
                    line.role === "user"
                      ? "border-[var(--flux-primary-alpha-35)] bg-[var(--flux-primary-alpha-10)] text-[var(--flux-text)]"
                      : "border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-black-alpha-12)] text-[var(--flux-text-muted)]"
                  }`}
                >
                  <div className="text-[9px] font-bold uppercase tracking-wide text-[var(--flux-text-muted)]">
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

          <form
            className="flex gap-2 border-t border-[var(--flux-chrome-alpha-10)] p-3"
            onSubmit={(e) => {
              e.preventDefault();
              sendQuestion(draft);
            }}
          >
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={t("fluxyChat.placeholder")}
              className="min-w-0 flex-1 rounded-[10px] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-mid)] px-3 py-2 text-sm text-[var(--flux-text)] outline-none focus:border-[var(--flux-primary)]"
              aria-label={t("fluxyChat.placeholder")}
            />
            <button type="submit" className="btn-primary px-4 py-2 text-xs shrink-0">
              {t("fluxyChat.send")}
            </button>
          </form>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setPanelOpen((o) => !o)}
        className="group flex items-center gap-3 rounded-[20px] border-[1.5px] border-[rgba(0,210,211,0.28)] bg-gradient-to-br from-[rgba(108,92,231,0.22)] to-[rgba(0,210,211,0.12)] py-2.5 pl-2.5 pr-6 font-fluxy shadow-[0_8px_32px_rgba(108,92,231,0.25)] backdrop-blur-[12px] motion-safe:transition-all motion-safe:duration-300 motion-safe:ease-[cubic-bezier(0.22,1,0.36,1)] hover:scale-[1.03] hover:shadow-[0_12px_40px_rgba(108,92,231,0.35)] active:scale-[0.98]"
        aria-expanded={panelOpen}
        aria-label={panelOpen ? t("fluxyChat.close") : t("fluxyChat.open")}
      >
        <span className="inline-flex h-11 w-11 items-center justify-center overflow-hidden rounded-full border border-[rgba(0,210,211,0.2)] bg-[rgba(13,11,26,0.6)] shadow-[0_0_12px_rgba(108,92,231,0.4)] sm:h-12 sm:w-12">
          <FluxyAvatar state={panelOpen ? "waving" : "idle"} size="header" className="scale-90" interactive />
        </span>
        <span className="hidden text-left sm:block">
          <span className="block font-fluxy text-[13px] font-semibold text-[var(--flux-text)]">{t("fluxyChat.fabTitle")}</span>
          <span className="block text-[10px] text-[var(--flux-text-muted)]">{t("fluxyChat.fabSubtitle")}</span>
        </span>
      </button>
    </div>
  );
}
