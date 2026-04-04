"use client";

import { useCallback, useEffect, useRef } from "react";

type WebSpeechRecognitionInstance = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onerror: ((ev: Event) => void) | null;
  onend: (() => void) | null;
  onresult:
    | ((
        ev: {
          resultIndex: number;
          results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
        }
      ) => void)
    | null;
};

export type WebSpeechRecognitionMessages = {
  notSupported: string;
  micError: string;
  startError: string;
};

export type UseWebSpeechRecognitionOptions = {
  lang?: string;
  continuous?: boolean;
  getMessages: () => WebSpeechRecognitionMessages;
  onFinal: (text: string) => void;
  onListeningChange?: (listening: boolean) => void;
  onInterimChange?: (text: string) => void;
  onErrorChange?: (error: string | null) => void;
};

/**
 * Wraps the browser SpeechRecognition API (Chrome/Edge). Final transcripts are passed to `onFinal`.
 */
export function useWebSpeechRecognition(options: UseWebSpeechRecognitionOptions) {
  const { lang = "pt-BR", continuous = false } = options;
  const recognitionRef = useRef<WebSpeechRecognitionInstance | null>(null);
  const optsRef = useRef(options);
  optsRef.current = options;

  const stop = useCallback(() => {
    try {
      recognitionRef.current?.stop();
    } catch {
      // ignore
    }
    recognitionRef.current = null;
    optsRef.current.onListeningChange?.(false);
    optsRef.current.onInterimChange?.("");
  }, []);

  const start = useCallback(() => {
    if (typeof window === "undefined") return;
    const W = window as unknown as {
      SpeechRecognition?: new () => WebSpeechRecognitionInstance;
      webkitSpeechRecognition?: new () => WebSpeechRecognitionInstance;
    };
    const Ctor = W.SpeechRecognition || W.webkitSpeechRecognition;
    if (!Ctor) {
      optsRef.current.onErrorChange?.(optsRef.current.getMessages().notSupported);
      return;
    }
    optsRef.current.onErrorChange?.(null);
    stop();
    const rec = new Ctor();
    rec.lang = lang;
    rec.interimResults = true;
    rec.continuous = continuous;
    recognitionRef.current = rec;
    optsRef.current.onListeningChange?.(true);
    optsRef.current.onInterimChange?.("");

    rec.onerror = () => {
      optsRef.current.onErrorChange?.(optsRef.current.getMessages().micError);
      stop();
    };

    rec.onend = () => {
      recognitionRef.current = null;
      optsRef.current.onListeningChange?.(false);
      optsRef.current.onInterimChange?.("");
    };

    rec.onresult = (event: {
      resultIndex: number;
      results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
    }) => {
      let finalText = "";
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const line = event.results[i];
        const chunk = line[0]?.transcript ?? "";
        if (line.isFinal) finalText += chunk;
        else interim += chunk;
      }
      optsRef.current.onInterimChange?.(interim.trim());
      const merged = (finalText || "").trim();
      if (merged) {
        stop();
        optsRef.current.onFinal(merged);
      }
    };

    try {
      rec.start();
    } catch {
      optsRef.current.onErrorChange?.(optsRef.current.getMessages().startError);
      stop();
    }
  }, [continuous, lang, stop]);

  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  return { start, stop };
}
