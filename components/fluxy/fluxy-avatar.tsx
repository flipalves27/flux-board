"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { FluxyAvatarSize, FluxyAvatarState } from "@/components/fluxy/fluxy-types";

const SIZE_PX: Record<FluxyAvatarSize, number> = {
  fab: 32,
  compact: 56,
  header: 80,
};

function subscribeReducedMotion(cb: () => void) {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

function getReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribeReducedMotion, getReducedMotion, () => false);
}

type ConfettiProps = { active: boolean };

function FluxyConfetti({ active }: ConfettiProps) {
  const pieces = useMemo(
    () =>
      Array.from({ length: 20 }, (_, i) => ({
        id: i,
        x: 200 + Math.random() * 280,
        delay: Math.random() * 1.2,
        dur: 1.5 + Math.random() * 1,
        colorVar: ["--flux-primary", "--flux-secondary", "--flux-accent", "--flux-primary-light", "--flux-text"][i % 5],
        size: 4 + Math.random() * 6,
        rot: Math.random() * 360,
      })),
    []
  );

  if (!active) return null;

  return (
    <g>
      {pieces.map((p) => (
        <rect
          key={p.id}
          x={p.x}
          y={-20}
          width={p.size}
          height={p.size * 0.6}
          rx={1}
          fill={`var(${p.colorVar})`}
          opacity={0.9}
          transform={`rotate(${p.rot} ${p.x} -20)`}
          style={{
            animation: `fluxy-confetti-fall ${p.dur}s ease-in ${p.delay}s infinite`,
          }}
        />
      ))}
    </g>
  );
}

export type FluxyAvatarProps = {
  state: FluxyAvatarState;
  size?: FluxyAvatarSize;
  className?: string;
  /** When true with state celebrating, renders confetti (default false for performance). */
  showConfetti?: boolean;
  title?: string;
};

const mouthPaths = [
  "M330 372 Q340 381, 354 371",
  "M330 368 Q340 380, 354 368",
  "M330 370 Q340 376, 354 370",
];

export function FluxyAvatar({
  state,
  size = "compact",
  className = "",
  showConfetti = false,
  title,
}: FluxyAvatarProps) {
  const reducedMotion = usePrefersReducedMotion();
  const [blinkOpen, setBlinkOpen] = useState(true);
  const [mouthFrame, setMouthFrame] = useState(0);
  const talkInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (reducedMotion || state === "sleeping") return;
    const blink = window.setInterval(() => {
      setBlinkOpen(false);
      window.setTimeout(() => setBlinkOpen(true), 150);
    }, 3000 + Math.random() * 2000);
    return () => window.clearInterval(blink);
  }, [reducedMotion, state]);

  useEffect(() => {
    if (reducedMotion) {
      if (talkInterval.current) clearInterval(talkInterval.current);
      setMouthFrame(0);
      return;
    }
    if (state === "talking") {
      talkInterval.current = setInterval(() => {
        setMouthFrame((p) => (p + 1) % 3);
      }, 180);
    } else {
      if (talkInterval.current) clearInterval(talkInterval.current);
      setMouthFrame(0);
    }
    return () => {
      if (talkInterval.current) clearInterval(talkInterval.current);
    };
  }, [state, reducedMotion]);

  const isSleeping = state === "sleeping";
  const isCelebrating = state === "celebrating";
  const isThinking = state === "thinking";
  const isTalking = state === "talking";
  const isWaving = state === "waving";

  const w = SIZE_PX[size];
  const motionAttr = reducedMotion ? "reduced" : "ok";

  const breatheAnim = reducedMotion ? "none" : isSleeping ? "fluxy-breathe 4s ease-in-out infinite" : "fluxy-breathe 3s ease-in-out infinite";

  return (
    <span
      className={`fluxy-avatar inline-flex shrink-0 items-center justify-center ${className}`}
      data-fluxy-motion={motionAttr}
      title={title}
      aria-hidden={true}
    >
      <svg
        width={w}
        viewBox="0 0 680 620"
        className="max-w-full overflow-visible"
        style={{
          animation: breatheAnim,
          filter: isSleeping
            ? "brightness(0.7) saturate(0.7)"
            : isCelebrating
              ? "brightness(1.08) saturate(1.15)"
              : "none",
          transition: "filter 0.6s ease",
        display: "block",
        height: "auto",
        }}
      >
        <FluxyConfetti active={Boolean(showConfetti && isCelebrating)} />

        <circle
          cx="340"
          cy="300"
          r="200"
          fill="var(--flux-primary)"
          opacity={isThinking ? 0.1 : 0.04}
          style={{ transition: "opacity 0.5s" }}
        >
          {isThinking && !reducedMotion ? (
            <animate attributeName="opacity" values="0.04;0.12;0.04" dur="2s" repeatCount="indefinite" />
          ) : null}
        </circle>

        <g
          style={{
            transformOrigin: "220px 480px",
            animation: reducedMotion
              ? "none"
              : isCelebrating
                ? "fluxy-tail-wag-fast 0.4s ease-in-out infinite"
                : isSleeping
                  ? "none"
                  : "fluxy-tail-wag 1.8s ease-in-out infinite",
          }}
        >
          <path
            d="M215 480 Q150 390, 170 320 Q180 290, 210 310 Q240 340, 230 400 Q225 440, 220 470 Z"
            fill="var(--flux-primary)"
            stroke="var(--flux-primary-dark)"
            strokeWidth="1.2"
          />
          <path
            d="M218 470 Q170 400, 190 340 Q200 315, 215 330 Q230 355, 225 410 Z"
            fill="var(--flux-primary-light)"
            opacity="0.5"
          />
          <path d="M172 325 Q165 300, 180 295 Q190 300, 185 315 Z" fill="var(--flux-secondary)" />
        </g>

        <ellipse cx="340" cy="470" rx="70" ry="62" fill="var(--flux-primary)" stroke="var(--flux-primary-dark)" strokeWidth="1.2" />
        <ellipse cx="340" cy="478" rx="44" ry="40" fill="var(--flux-text)" opacity="0.92" />

        <path
          d="M280 438 Q258 448, 254 468 Q252 484, 268 486"
          fill="var(--flux-primary)"
          stroke="var(--flux-primary-dark)"
          strokeWidth="1.2"
        />
        <ellipse
          cx="268"
          cy="488"
          rx="11"
          ry="7"
          fill="var(--flux-text)"
          opacity="0.9"
          stroke="var(--flux-text-muted)"
          strokeWidth="0.5"
        />

        <g
          style={{
            transformOrigin: "400px 428px",
            animation: reducedMotion || !isWaving ? "none" : "fluxy-wave-arm 0.6s ease-in-out infinite",
          }}
        >
          <path
            d="M400 428 Q422 412, 436 394 Q440 388, 434 385"
            fill="var(--flux-primary)"
            stroke="var(--flux-primary-dark)"
            strokeWidth="1.2"
          />
          <ellipse
            cx="435"
            cy="384"
            rx="10"
            ry="7"
            fill="var(--flux-text)"
            opacity="0.9"
            stroke="var(--flux-text-muted)"
            strokeWidth="0.5"
          />
        </g>

        {!isSleeping && (
          <g transform="translate(444, 352)" style={{ animation: reducedMotion ? "none" : "fluxy-float-card 3s ease-in-out infinite" }}>
            <rect x="0" y="0" width="44" height="32" rx="4" fill="var(--flux-surface-mid)" stroke="var(--flux-secondary)" strokeWidth="1" />
            <rect x="5" y="5" width="18" height="3" rx="1" fill="var(--flux-secondary)" opacity="0.8" />
            <rect x="5" y="11" width="34" height="2" rx="1" fill="var(--flux-primary)" opacity="0.5" />
            <rect x="5" y="16" width="28" height="2" rx="1" fill="var(--flux-primary)" opacity="0.4" />
            <rect x="5" y="23" width="10" height="4" rx="2" fill="var(--flux-accent)" opacity="0.6" />
            <path
              d="M32 24 L35 27 L40 21"
              fill="none"
              stroke="var(--flux-accent)"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
        )}

        {isThinking && (
          <g transform="translate(420, 230)">
            <g style={{ animation: reducedMotion ? "none" : "fluxy-gear-spin 3s linear infinite", transformOrigin: "0px 0px" }}>
              <circle cx="0" cy="0" r="18" fill="none" stroke="var(--flux-secondary)" strokeWidth="2" strokeDasharray="8 4" opacity="0.7" />
              <circle cx="0" cy="0" r="6" fill="var(--flux-secondary)" opacity="0.5" />
            </g>
            <g
              style={{
                animation: reducedMotion ? "none" : "fluxy-gear-spin 2s linear infinite reverse",
                transformOrigin: "22px -14px",
              }}
            >
              <circle cx="22" cy="-14" r="12" fill="none" stroke="var(--flux-accent)" strokeWidth="1.5" strokeDasharray="6 3" opacity="0.6" />
              <circle cx="22" cy="-14" r="4" fill="var(--flux-accent)" opacity="0.4" />
            </g>
            {[0, 1, 2].map((i) => (
              <circle
                key={i}
                cx={-30 + i * 14}
                cy={30}
                r="3"
                fill="var(--flux-secondary)"
                opacity="0.5"
                style={{
                  animation: reducedMotion ? "none" : `fluxy-think-dots 1.2s ease ${i * 0.3}s infinite`,
                }}
              />
            ))}
          </g>
        )}

        {isSleeping &&
          [0, 1, 2].map((i) => (
            <text
              key={i}
              x={400 + i * 25}
              y={280 - i * 25}
              fill="var(--flux-primary-light)"
              fontSize={14 - i * 2}
              fontFamily="ui-monospace, monospace"
              fontWeight="600"
              opacity="0.7"
              style={{
                animation: reducedMotion ? "none" : `fluxy-z-float 2.5s ease ${i * 0.8}s infinite`,
              }}
            >
              Z
            </text>
          ))}

        <ellipse cx="340" cy="330" rx="88" ry="80" fill="var(--flux-primary)" stroke="var(--flux-primary-dark)" strokeWidth="1.2" />
        <path
          d="M290 322 Q302 298, 340 286 Q378 298, 390 322 Q386 376, 340 400 Q294 376, 290 322 Z"
          fill="var(--flux-text)"
          opacity="0.92"
          stroke="var(--flux-text-muted)"
          strokeWidth="0.5"
        />

        <path d="M264 278 L240 168 L298 258 Z" fill="var(--flux-primary)" stroke="var(--flux-primary-dark)" strokeWidth="1.2" />
        <path d="M270 270 L250 188 L290 256 Z" fill="var(--flux-primary-light)" />
        <path d="M416 278 L440 168 L382 258 Z" fill="var(--flux-primary)" stroke="var(--flux-primary-dark)" strokeWidth="1.2" />
        <path d="M410 270 L430 188 L390 256 Z" fill="var(--flux-primary-light)" />
        <path d="M242 175 L240 168 L248 178 Z" fill="var(--flux-secondary)" />
        <path d="M438 175 L440 168 L432 178 Z" fill="var(--flux-secondary)" />

        {isSleeping ? (
          <>
            <path d="M302 332 Q316 326, 330 332" fill="none" stroke="var(--flux-primary-dark)" strokeWidth="2" strokeLinecap="round" />
            <path d="M350 332 Q364 326, 378 332" fill="none" stroke="var(--flux-primary-dark)" strokeWidth="2" strokeLinecap="round" />
          </>
        ) : (
          <g style={{ transition: "transform 0.15s" }}>
            <ellipse
              cx="316"
              cy="330"
              rx="13"
              ry={blinkOpen ? 14 : 1.5}
              fill="var(--flux-text-on-primary)"
              stroke="var(--flux-primary-dark)"
              strokeWidth="0.8"
              style={{ transition: "ry 0.1s" }}
            />
            {blinkOpen ? (
              <>
                <ellipse cx="319" cy="328" rx="7.5" ry="8.5" fill="var(--flux-surface-mid)" />
                <circle cx="321" cy="325" r="2.8" fill="var(--flux-text-on-primary)" />
              </>
            ) : null}
            <ellipse
              cx="364"
              cy="330"
              rx="13"
              ry={blinkOpen ? 14 : 1.5}
              fill="var(--flux-text-on-primary)"
              stroke="var(--flux-primary-dark)"
              strokeWidth="0.8"
              style={{ transition: "ry 0.1s" }}
            />
            {blinkOpen ? (
              <>
                <ellipse cx="367" cy="328" rx="7.5" ry="8.5" fill="var(--flux-surface-mid)" />
                <circle cx="369" cy="325" r="2.8" fill="var(--flux-text-on-primary)" />
              </>
            ) : null}
          </g>
        )}

        {!isSleeping && (
          <>
            <path d="M300 312 Q314 305, 328 309" fill="none" stroke="var(--flux-primary-dark)" strokeWidth="2" strokeLinecap="round" />
            <path d="M352 309 Q366 305, 380 312" fill="none" stroke="var(--flux-primary-dark)" strokeWidth="2" strokeLinecap="round" />
          </>
        )}

        <ellipse cx="340" cy="360" rx="8" ry="5.5" fill="var(--flux-surface-mid)" />
        <circle cx="337" cy="358" r="1.5" fill="var(--flux-primary-dark)" opacity="0.4" />

        <path
          d={isTalking ? mouthPaths[mouthFrame] : isCelebrating ? "M325 370 Q340 388, 355 370" : "M330 372 Q340 381, 354 371"}
          fill={isTalking || isCelebrating ? "var(--flux-primary-dark)" : "none"}
          stroke="var(--flux-primary-dark)"
          strokeWidth="1.4"
          strokeLinecap="round"
        />

        <line x1="288" y1="358" x2="254" y2="350" stroke="var(--flux-primary-light)" strokeWidth="0.8" opacity="0.4" />
        <line x1="288" y1="366" x2="252" y2="368" stroke="var(--flux-primary-light)" strokeWidth="0.8" opacity="0.35" />
        <line x1="392" y1="358" x2="426" y2="350" stroke="var(--flux-primary-light)" strokeWidth="0.8" opacity="0.4" />
        <line x1="392" y1="366" x2="428" y2="368" stroke="var(--flux-primary-light)" strokeWidth="0.8" opacity="0.35" />

        <g style={{ animation: isThinking && !reducedMotion ? "fluxy-glasses-glow 2s ease infinite" : "none" }}>
          <rect x="296" y="317" width="38" height="28" rx="5" fill="none" stroke="var(--flux-secondary)" strokeWidth="1.6" />
          <rect x="346" y="317" width="38" height="28" rx="5" fill="none" stroke="var(--flux-secondary)" strokeWidth="1.6" />
          <line x1="334" y1="331" x2="346" y2="331" stroke="var(--flux-secondary)" strokeWidth="1.6" />
          <line x1="296" y1="326" x2="278" y2="316" stroke="var(--flux-secondary)" strokeWidth="1.6" strokeLinecap="round" />
          <line x1="384" y1="326" x2="402" y2="316" stroke="var(--flux-secondary)" strokeWidth="1.6" strokeLinecap="round" />
        </g>

        {isCelebrating &&
          [
            { cx: 220, cy: 260, d: 0 },
            { cx: 460, cy: 280, d: 0.4 },
            { cx: 280, cy: 200, d: 0.8 },
            { cx: 420, cy: 220, d: 1.2 },
          ].map((s, i) => (
            <g
              key={i}
              style={{
                animation: reducedMotion ? "none" : `fluxy-sparkle 1.2s ease ${s.d}s infinite`,
              }}
            >
              <line x1={s.cx - 6} y1={s.cy} x2={s.cx + 6} y2={s.cy} stroke="var(--flux-accent)" strokeWidth="2" strokeLinecap="round" />
              <line x1={s.cx} y1={s.cy - 6} x2={s.cx} y2={s.cy + 6} stroke="var(--flux-accent)" strokeWidth="2" strokeLinecap="round" />
            </g>
          ))}

        <path d="M312 528 Q307 552, 302 566 Q300 574, 307 576" fill="var(--flux-primary)" stroke="var(--flux-primary-dark)" strokeWidth="1.2" />
        <ellipse cx="312" cy="578" rx="21" ry="9" fill="var(--flux-primary)" stroke="var(--flux-primary-dark)" strokeWidth="0.8" />
        <ellipse cx="314" cy="579" rx="11" ry="5" fill="var(--flux-text)" opacity="0.9" />
        <path d="M368 528 Q373 552, 376 566 Q378 574, 372 576" fill="var(--flux-primary)" stroke="var(--flux-primary-dark)" strokeWidth="1.2" />
        <ellipse cx="372" cy="578" rx="21" ry="9" fill="var(--flux-primary)" stroke="var(--flux-primary-dark)" strokeWidth="0.8" />
        <ellipse cx="370" cy="579" rx="11" ry="5" fill="var(--flux-text)" opacity="0.9" />

        {!isSleeping && (
          <g opacity={isCelebrating ? 0.7 : 0.4}>
            <line x1="168" y1="395" x2="212" y2="395" stroke="var(--flux-secondary)" strokeWidth="1.8" strokeLinecap="round" opacity="0.5" />
            <line x1="158" y1="415" x2="206" y2="415" stroke="var(--flux-secondary)" strokeWidth="1.3" strokeLinecap="round" opacity="0.35" />
            <line x1="173" y1="435" x2="210" y2="435" stroke="var(--flux-secondary)" strokeWidth="1" strokeLinecap="round" opacity="0.25" />
          </g>
        )}
      </svg>
    </span>
  );
}
