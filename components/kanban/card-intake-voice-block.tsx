"use client";

import { useCallback, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch, apiPost, ApiError, getApiHeaders } from "@/lib/api-client";
import { useToast } from "@/context/toast-context";
import type { DescriptionBlocksState } from "@/components/kanban/description-blocks";
import { parseDescriptionToBlocks } from "@/components/kanban/description-blocks";
import { FluxyAvatar } from "@/components/fluxy/fluxy-avatar";
import { FluxySpeechBubble } from "@/components/fluxy/fluxy-speech-bubble";
import { useWebSpeechRecognition } from "@/hooks/use-web-speech-recognition";
import type { FluxyAvatarState } from "@/components/fluxy/fluxy-types";

type Props = {
  boardId: string;
  getHeaders: () => Record<string, string>;
  mode: "new" | "edit";
  setTitle: (v: string) => void;
  setDescBlocks: (v: DescriptionBlocksState | ((prev: DescriptionBlocksState) => DescriptionBlocksState)) => void;
  onApplied?: () => void;
};

type VoiceDraftResponse = {
  ok?: boolean;
  titulo?: string;
  descricao?: string;
  error?: string;
};

export function CardIntakeVoiceBlock({ boardId, getHeaders, mode, setTitle, setDescBlocks, onApplied }: Props) {
  const t = useTranslations("kanban.cardModal.intakeVoice");
  const { pushToast } = useToast();
  const audioInputRef = useRef<HTMLInputElement>(null);

  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [speechErr, setSpeechErr] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const { start: startListening, stop: stopListening } = useWebSpeechRecognition({
    lang: "pt-BR",
    continuous: false,
    getMessages: () => ({
      notSupported: t("voiceNotSupported"),
      micError: t("voiceMicError"),
      startError: t("voiceStartError"),
    }),
    onFinal: (text) => {
      setTranscript((prev) => {
        const next = (prev ? `${prev} ${text}` : text).trim();
        return next.slice(0, 4000);
      });
    },
    onListeningChange: setListening,
    onInterimChange: setInterim,
    onErrorChange: setSpeechErr,
  });

  const toggleMic = useCallback(() => {
    if (busy || transcribing) return;
    setErr(null);
    if (listening) {
      stopListening();
      return;
    }
    startListening();
  }, [busy, listening, startListening, stopListening, transcribing]);

  const onPickAudio = () => audioInputRef.current?.click();

  const onAudioFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || busy || transcribing) return;
    setTranscribing(true);
    setErr(null);
    setSpeechErr(null);
    try {
      const form = new FormData();
      form.append("file", file, file.name);
      const headers = { ...getHeaders(), ...getApiHeaders() };
      delete (headers as Record<string, string>)["Content-Type"];
      const res = await apiFetch(`/api/boards/${encodeURIComponent(boardId)}/transcribe`, {
        method: "POST",
        body: form,
        headers,
      });
      const data = (await res.json().catch(() => ({}))) as { transcript?: string; error?: string };
      if (!res.ok) {
        throw new ApiError(data.error ?? t("transcribeError"), res.status);
      }
      const next = String(data.transcript || "").trim();
      if (!next) {
        setErr(t("transcribeEmpty"));
        return;
      }
      setTranscript((prev) => {
        const merged = (prev ? `${prev} ${next}` : next).trim();
        return merged.slice(0, 4000);
      });
      pushToast({ kind: "success", title: t("transcribeSuccess") });
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : t("transcribeError"));
    } finally {
      setTranscribing(false);
    }
  };

  const generate = async () => {
    const payload = transcript.trim();
    if (!payload || busy) return;
    setBusy(true);
    setErr(null);
    setSpeechErr(null);
    try {
      const data = await apiPost<VoiceDraftResponse>(
        `/api/boards/${encodeURIComponent(boardId)}/card-voice-draft`,
        { transcript: payload.slice(0, 4000) },
        { ...getHeaders(), ...getApiHeaders() }
      );
      const nextTitle = String(data?.titulo || "").trim();
      const nextDesc = String(data?.descricao || "").trim();
      if (nextTitle) setTitle(nextTitle);
      if (nextDesc) setDescBlocks(parseDescriptionToBlocks(nextDesc));
      onApplied?.();
      pushToast({ kind: "success", title: t("success") });
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : t("error"));
    } finally {
      setBusy(false);
    }
  };

  if (mode !== "new") return null;

  const avatarState: FluxyAvatarState = busy ? "thinking" : listening ? "talking" : "idle";

  return (
    <div className="mb-4 rounded-xl border border-[var(--flux-primary-alpha-22)] bg-[var(--flux-primary-alpha-06)] px-3 py-2.5">
      <div className="flex flex-wrap items-start gap-3">
        <div className="relative shrink-0">
          <FluxyAvatar state={avatarState} size="compact" title={t("badge")} />
          {listening ? (
            <span
              className="pointer-events-none absolute inset-0 rounded-full border-2 border-[var(--flux-primary)] opacity-70 animate-pulse"
              aria-hidden
            />
          ) : null}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--flux-primary-light)]">{t("badge")}</p>
            <p className="text-[11px] text-[var(--flux-text-muted)]">{t("hint")}</p>
          </div>
          {listening ? (
            <FluxySpeechBubble className="!px-3 !py-2 !text-left !text-[11px]">
              <span className="block font-semibold text-[var(--flux-primary-light)]">{t("listening")}</span>
              <span className="mt-1 block text-[var(--flux-text-muted)]">{interim.trim() || t("speakPrompt")}</span>
            </FluxySpeechBubble>
          ) : null}
          <textarea
            value={transcript}
            onChange={(e) => setTranscript(e.target.value.slice(0, 4000))}
            placeholder={t("pastePlaceholder")}
            rows={3}
            className="w-full resize-y rounded-lg border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-dark)] px-2.5 py-2 text-[11px] text-[var(--flux-text)] placeholder:text-[var(--flux-text-muted)]"
            disabled={busy || transcribing}
            aria-label={t("pastePlaceholder")}
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={`btn-secondary px-3 py-1.5 text-[11px] ${listening ? "border-[var(--flux-teal-alpha-45)] bg-[var(--flux-teal-alpha-12)]" : ""}`}
              disabled={busy || transcribing}
              aria-pressed={listening}
              onClick={toggleMic}
            >
              {listening ? t("micStop") : t("micStart")}
            </button>
            <input
              ref={audioInputRef}
              type="file"
              accept="audio/*,.m4a,.mp3,.wav,.webm,.ogg"
              className="hidden"
              onChange={(ev) => void onAudioFile(ev)}
            />
            <button type="button" className="btn-secondary px-3 py-1.5 text-[11px]" disabled={busy || transcribing} onClick={onPickAudio}>
              {transcribing ? t("transcribeBusy") : t("pickAudio")}
            </button>
            <button
              type="button"
              className="btn-primary px-3 py-1.5 text-[11px]"
              disabled={busy || transcribing || !transcript.trim()}
              onClick={() => void generate()}
            >
              {busy ? t("busy") : t("generate")}
            </button>
          </div>
        </div>
      </div>
      {speechErr ? <p className="mt-2 text-[11px] text-[var(--flux-danger-bright)]">{speechErr}</p> : null}
      {err ? <p className="mt-2 text-[11px] text-[var(--flux-danger-bright)]">{err}</p> : null}
    </div>
  );
}
