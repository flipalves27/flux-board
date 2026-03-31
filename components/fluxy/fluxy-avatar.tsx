"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { FluxyAvatarSize, FluxyAvatarState } from "@/components/fluxy/fluxy-types";

const SIZE_PX: Record<FluxyAvatarSize, number> = {
  fab: 32,
  compact: 56,
  header: 80,
};

const HEART_X = [228, 252, 268, 290, 310] as const;

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

type ConfettiProps = { active: boolean; reducedMotion: boolean };

function FluxyConfetti({ active, reducedMotion }: ConfettiProps) {
  const pieces = useMemo(
    () =>
      Array.from({ length: 20 }, (_, i) => ({
        id: i,
        x: 160 + ((i * 47) % 360),
        delay: (i * 0.07) % 1.5,
        dur: 2 + (i % 5) * 0.2,
        colorVar: ["--flux-fluxy-fur", "--flux-secondary", "--flux-accent", "--flux-fluxy-fur-light", "--flux-fluxy-face"][i % 5],
        size: 5 + (i % 4),
      })),
    []
  );

  if (!active || reducedMotion) return null;

  return (
    <g>
      {pieces.map((p) => (
        <rect
          key={p.id}
          x={p.x}
          y={-20}
          width={p.size}
          height={p.size * 0.5}
          rx={1.5}
          fill={`var(${p.colorVar})`}
          opacity={0.85}
          style={{ animation: `fluxy-confetti-fall ${p.dur}s ease-in ${p.delay}s infinite` }}
        />
      ))}
    </g>
  );
}

type StarSparkleProps = { cx: number; cy: number; delay?: number; size?: number; reducedMotion: boolean };

function StarSparkle({ cx, cy, delay = 0, size = 1, reducedMotion }: StarSparkleProps) {
  if (reducedMotion) {
    return (
      <g>
        <circle cx={cx} cy={cy} r={3 * size} fill="var(--flux-secondary)" opacity={0.6} />
        <line
          x1={cx - 5 * size}
          y1={cy}
          x2={cx + 5 * size}
          y2={cy}
          stroke="var(--flux-secondary)"
          strokeWidth={1.2}
          strokeLinecap="round"
          opacity={0.5}
        />
        <line
          x1={cx}
          y1={cy - 5 * size}
          x2={cx}
          y2={cy + 5 * size}
          stroke="var(--flux-secondary)"
          strokeWidth={1.2}
          strokeLinecap="round"
          opacity={0.5}
        />
      </g>
    );
  }
  return (
    <g style={{ animation: `fluxy-sparkle 2s ease ${delay}s infinite` }}>
      <circle cx={cx} cy={cy} r={3 * size} fill="var(--flux-secondary)" opacity={0.8} />
      <line
        x1={cx - 5 * size}
        y1={cy}
        x2={cx + 5 * size}
        y2={cy}
        stroke="var(--flux-secondary)"
        strokeWidth={1.2}
        strokeLinecap="round"
        opacity={0.6}
      />
      <line
        x1={cx}
        y1={cy - 5 * size}
        x2={cx}
        y2={cy + 5 * size}
        stroke="var(--flux-secondary)"
        strokeWidth={1.2}
        strokeLinecap="round"
        opacity={0.6}
      />
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
  /** Hover scale + hearts (docks / hero); respects reduced motion. */
  interactive?: boolean;
};

const mouthRyFrames = [0, 6, 10, 4];

export function FluxyAvatar({
  state,
  size = "compact",
  className = "",
  showConfetti = false,
  title,
  interactive = false,
}: FluxyAvatarProps) {
  const reducedMotion = usePrefersReducedMotion();
  const [blinkOpen, setBlinkOpen] = useState(true);
  const [mouthFrame, setMouthFrame] = useState(0);
  const [hovered, setHovered] = useState(false);
  const talkRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (reducedMotion || state === "sleeping") return;
    const id = window.setInterval(() => {
      setBlinkOpen(false);
      window.setTimeout(() => setBlinkOpen(true), 130);
    }, 2800 + Math.random() * 2000);
    return () => window.clearInterval(id);
  }, [reducedMotion, state]);

  useEffect(() => {
    if (reducedMotion) {
      if (talkRef.current) clearInterval(talkRef.current);
      setMouthFrame(0);
      return;
    }
    if (state === "talking") {
      talkRef.current = setInterval(() => setMouthFrame((p) => (p + 1) % 4), 150);
    } else {
      if (talkRef.current) clearInterval(talkRef.current);
      setMouthFrame(0);
    }
    return () => {
      if (talkRef.current) clearInterval(talkRef.current);
    };
  }, [state, reducedMotion]);

  const isSleeping = state === "sleeping";
  const isCelebrating = state === "celebrating";
  const isThinking = state === "thinking";
  const isTalking = state === "talking";
  const isWaving = state === "waving";

  const w = SIZE_PX[size];
  const motionAttr = reducedMotion ? "reduced" : "ok";

  const breatheAnim = reducedMotion
    ? "none"
    : isSleeping
      ? "fluxy-breathe-slow 5s ease-in-out infinite"
      : "fluxy-breathe 3.2s ease-in-out infinite";

  const mouthOpen = mouthRyFrames[mouthFrame];
  const showHearts = interactive && hovered && !isSleeping && !reducedMotion;
  const hoverScale = interactive && !isSleeping && hovered ? "scale(1.03)" : "scale(1)";

  const svg = (
    <svg
      width={w}
      viewBox="0 0 680 640"
      className="max-w-full overflow-visible"
      style={{
        animation: breatheAnim,
        filter: isSleeping ? "brightness(0.65) saturate(0.6)" : "none",
        transition: "filter 0.8s ease",
        display: "block",
        height: "auto",
      }}
    >
      <FluxyConfetti active={Boolean(showConfetti && isCelebrating)} reducedMotion={reducedMotion} />

      {showHearts
        ? HEART_X.map((x, i) => (
            <text
              key={i}
              x={x}
              y={580}
              fontSize={16}
              fill="var(--flux-accent)"
              style={{ animation: `fluxy-heart-rise 2.5s ease-out ${i * 0.5}s infinite` }}
            >
              ♥
            </text>
          ))
        : null}

      <ellipse
        cx="340"
        cy="340"
        rx="220"
        ry="180"
        fill="var(--flux-fluxy-fur)"
        opacity={isThinking ? 0.08 : 0.03}
        style={{ transition: "opacity 0.5s" }}
      >
        {isThinking && !reducedMotion ? (
          <animate attributeName="opacity" values="0.03;0.1;0.03" dur="2.5s" repeatCount="indefinite" />
        ) : null}
      </ellipse>

      <g
        style={{
          transformOrigin: "230px 490px",
          animation: reducedMotion
            ? "none"
            : isCelebrating
              ? "fluxy-tail-wag-fast 0.35s ease-in-out infinite"
              : isSleeping
                ? "none"
                : "fluxy-tail-wag 2s ease-in-out infinite",
        }}
      >
        <path
          d="M230 490 Q155 400,165 310 Q170 270,205 295 Q240 330,235 400 Q232 450,230 485Z"
          fill="var(--flux-fluxy-fur)"
          stroke="var(--flux-fluxy-fur-dark)"
          strokeWidth="1"
        />
        <path
          d="M232 480 Q175 405,185 330 Q192 305,210 315 Q232 340,230 410Z"
          fill="var(--flux-fluxy-fur-light)"
          opacity="0.45"
        />
        <path d="M167 315 Q158 280,175 272 Q188 278,182 308Z" fill="var(--flux-fluxy-face)" />
      </g>

      <ellipse cx="340" cy="475" rx="82" ry="72" fill="var(--flux-fluxy-fur)" stroke="var(--flux-fluxy-fur-dark)" strokeWidth="1" />
      <ellipse cx="340" cy="484" rx="55" ry="50" fill="var(--flux-fluxy-face)" />
      <circle cx="325" cy="490" r="3" fill="var(--flux-fluxy-face-muted)" opacity="0.5" />
      <circle cx="355" cy="490" r="3" fill="var(--flux-fluxy-face-muted)" opacity="0.5" />
      <circle cx="340" cy="475" r="2.5" fill="var(--flux-fluxy-face-muted)" opacity="0.4" />

      <path
        d="M270 448 Q248 460,244 482 Q242 498,260 500"
        fill="var(--flux-fluxy-fur)"
        stroke="var(--flux-fluxy-fur-dark)"
        strokeWidth="1"
      />
      <ellipse cx="260" cy="502" rx="13" ry="9" fill="var(--flux-fluxy-face)" stroke="var(--flux-fluxy-face-muted)" strokeWidth="0.5" />
      <circle cx="255" cy="500" r="2" fill="var(--flux-fluxy-face-muted)" />
      <circle cx="263" cy="499" r="2" fill="var(--flux-fluxy-face-muted)" />

      <g
        style={{
          transformOrigin: "410px 440px",
          animation: reducedMotion || !isWaving ? "none" : "fluxy-wave-arm 0.8s ease-in-out infinite",
        }}
      >
        <path
          d="M410 440 Q432 424,445 404 Q450 395,443 392"
          fill="var(--flux-fluxy-fur)"
          stroke="var(--flux-fluxy-fur-dark)"
          strokeWidth="1"
        />
        <ellipse cx="443" cy="390" rx="12" ry="8" fill="var(--flux-fluxy-face)" stroke="var(--flux-fluxy-face-muted)" strokeWidth="0.5" />
        <circle cx="438" cy="388" r="2" fill="var(--flux-fluxy-face-muted)" />
        <circle cx="446" cy="387" r="2" fill="var(--flux-fluxy-face-muted)" />
      </g>

      {!isSleeping && !isWaving ? (
        <g transform="translate(452,356)" style={{ animation: reducedMotion ? "none" : "fluxy-float-card 3.5s ease-in-out infinite" }}>
          <rect x="0" y="0" width="48" height="36" rx="6" fill="var(--flux-fluxy-void)" stroke="var(--flux-secondary)" strokeWidth="1.2" />
          <rect x="6" y="6" width="20" height="3.5" rx="1.5" fill="var(--flux-secondary)" opacity="0.8" />
          <rect x="6" y="13" width="36" height="2.5" rx="1" fill="var(--flux-fluxy-fur)" opacity="0.4" />
          <rect x="6" y="19" width="28" height="2.5" rx="1" fill="var(--flux-fluxy-fur)" opacity="0.3" />
          <rect x="6" y="26" width="12" height="5" rx="2.5" fill="var(--flux-accent)" opacity="0.5" />
          <path
            d="M34 27 L37.5 30.5 L43 24"
            fill="none"
            stroke="var(--flux-secondary)"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      ) : null}

      {isThinking ? (
        <g>
          <circle
            cx="430"
            cy="248"
            r="8"
            fill="var(--flux-fluxy-void)"
            stroke="var(--flux-secondary)"
            strokeWidth="1"
            style={{ animation: reducedMotion ? "none" : "fluxy-think-bubble 1.5s ease 0s infinite" }}
          />
          <circle
            cx="452"
            cy="224"
            r="12"
            fill="var(--flux-fluxy-void)"
            stroke="var(--flux-secondary)"
            strokeWidth="1"
            style={{ animation: reducedMotion ? "none" : "fluxy-think-bubble 1.5s ease 0.3s infinite" }}
          />
          <circle
            cx="478"
            cy="204"
            r="18"
            fill="var(--flux-fluxy-void)"
            stroke="var(--flux-secondary)"
            strokeWidth="1.2"
            style={{ animation: reducedMotion ? "none" : "fluxy-think-bubble 1.5s ease 0.6s infinite" }}
          />
          {[0, 1, 2].map((i) => (
            <circle
              key={i}
              cx={470 + i * 10}
              cy="204"
              r="2.5"
              fill="var(--flux-secondary)"
              style={{ animation: reducedMotion ? "none" : `fluxy-think-bubble 1s ease ${i * 0.25}s infinite` }}
            />
          ))}
        </g>
      ) : null}

      {isSleeping &&
        [0, 1, 2].map((i) => (
          <text
            key={i}
            x={410 + i * 22}
            y={270 - i * 28}
            fill="var(--flux-fluxy-fur-light)"
            fontSize={16 - i * 3}
            style={{
              fontFamily: "var(--font-fluxy), Space Grotesk, sans-serif",
              fontWeight: 700,
              animation: reducedMotion ? "none" : `fluxy-z-float 3s ease ${i * 0.9}s infinite`,
            }}
          >
            z
          </text>
        ))}

      <ellipse cx="340" cy="310" rx="105" ry="100" fill="var(--flux-fluxy-fur)" stroke="var(--flux-fluxy-fur-dark)" strokeWidth="1" />
      <path
        d="M278 305 Q290 275,340 260 Q390 275,402 305 Q398 370,340 398 Q282 370,278 305Z"
        fill="var(--flux-fluxy-face)"
        stroke="var(--flux-fluxy-face-muted)"
        strokeWidth="0.5"
      />

      <g
        style={{
          transformOrigin: "268px 265px",
          animation: reducedMotion || (!isWaving && !hovered) ? "none" : "fluxy-ear-perk 1s ease infinite",
        }}
      >
        <path d="M268 265 L240 148 L310 240Z" fill="var(--flux-fluxy-fur)" stroke="var(--flux-fluxy-fur-dark)" strokeWidth="1" />
        <path d="M275 255 L252 172 L302 238Z" fill="var(--flux-fluxy-fur-light)" />
        <path d="M244 158 L240 148 L254 168Z" fill="var(--flux-secondary)" />
      </g>
      <g
        style={{
          transformOrigin: "412px 265px",
          animation: reducedMotion || (!isWaving && !hovered) ? "none" : "fluxy-ear-perk-r 1s ease 0.15s infinite",
        }}
      >
        <path d="M412 265 L440 148 L370 240Z" fill="var(--flux-fluxy-fur)" stroke="var(--flux-fluxy-fur-dark)" strokeWidth="1" />
        <path d="M405 255 L428 172 L378 238Z" fill="var(--flux-fluxy-fur-light)" />
        <path d="M436 158 L440 148 L426 168Z" fill="var(--flux-secondary)" />
      </g>

      {isSleeping ? (
        <>
          <path d="M296 314 Q316 304,336 314" fill="none" stroke="var(--flux-fluxy-fur-dark)" strokeWidth="2.5" strokeLinecap="round" />
          <path d="M344 314 Q364 304,384 314" fill="none" stroke="var(--flux-fluxy-fur-dark)" strokeWidth="2.5" strokeLinecap="round" />
        </>
      ) : (
        <>
          <ellipse
            cx="316"
            cy="312"
            rx="20"
            ry={blinkOpen ? 22 : 2}
            fill="#fff"
            stroke="var(--flux-fluxy-fur-dark)"
            strokeWidth="0.8"
            style={{ transition: "ry 0.1s" }}
          />
          {blinkOpen ? (
            <>
              <ellipse cx="320" cy="310" rx="11" ry="13" fill="var(--flux-fluxy-eye)" />
              <circle cx="324" cy="305" r="5" fill="#fff" />
              <circle cx="314" cy="316" r="2.5" fill="#fff" opacity="0.5" />
              <circle cx="326" cy="302" r="1.2" fill="var(--flux-secondary)" opacity="0.7" />
            </>
          ) : null}
          <ellipse
            cx="364"
            cy="312"
            rx="20"
            ry={blinkOpen ? 22 : 2}
            fill="#fff"
            stroke="var(--flux-fluxy-fur-dark)"
            strokeWidth="0.8"
            style={{ transition: "ry 0.1s" }}
          />
          {blinkOpen ? (
            <>
              <ellipse cx="368" cy="310" rx="11" ry="13" fill="var(--flux-fluxy-eye)" />
              <circle cx="372" cy="305" r="5" fill="#fff" />
              <circle cx="362" cy="316" r="2.5" fill="#fff" opacity="0.5" />
              <circle cx="374" cy="302" r="1.2" fill="var(--flux-secondary)" opacity="0.7" />
            </>
          ) : null}
        </>
      )}

      {!isSleeping ? (
        <>
          <path
            d={isCelebrating ? "M296 286 Q310 276,332 282" : "M298 290 Q312 282,330 286"}
            fill="none"
            stroke="var(--flux-fluxy-fur-dark)"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path
            d={isCelebrating ? "M348 282 Q370 276,384 286" : "M350 286 Q368 282,382 290"}
            fill="none"
            stroke="var(--flux-fluxy-fur-dark)"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </>
      ) : null}

      <circle
        cx="280"
        cy="340"
        r="14"
        fill="var(--flux-accent)"
        opacity="0.35"
        style={{
          animation:
            reducedMotion || (!hovered && !isCelebrating && !isWaving)
              ? "none"
              : "fluxy-cheek-blush 1.5s ease infinite",
        }}
      />
      <circle
        cx="400"
        cy="340"
        r="14"
        fill="var(--flux-accent)"
        opacity="0.35"
        style={{
          animation:
            reducedMotion || (!hovered && !isCelebrating && !isWaving)
              ? "none"
              : "fluxy-cheek-blush 1.5s ease 0.3s infinite",
        }}
      />

      <ellipse cx="340" cy="348" rx="7" ry="5" fill="var(--flux-fluxy-eye)" />
      <circle cx="338" cy="346" r="1.5" fill="var(--flux-fluxy-fur-dark)" opacity="0.35" />

      {isTalking ? (
        <ellipse
          cx="340"
          cy="366"
          rx="8"
          ry={mouthOpen}
          fill="var(--flux-fluxy-fur-dark)"
          stroke="#3d2ba8"
          strokeWidth="0.8"
        />
      ) : isCelebrating ? (
        <path d="M322 360 Q340 382,358 360" fill="var(--flux-fluxy-fur-dark)" stroke="#3d2ba8" strokeWidth="0.8" />
      ) : isSleeping ? (
        <path d="M332 362 Q340 368,348 362" fill="none" stroke="var(--flux-fluxy-fur-dark)" strokeWidth="1.5" strokeLinecap="round" />
      ) : (
        <>
          <path d="M328 362 Q340 374,352 362" fill="none" stroke="var(--flux-fluxy-fur-dark)" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M348 362 L350 368 L352 362" fill="var(--flux-fluxy-face)" stroke="var(--flux-fluxy-face-muted)" strokeWidth="0.5" />
        </>
      )}

      <line x1="282" y1="345" x2="252" y2="338" stroke="var(--flux-fluxy-fur-light)" strokeWidth="0.8" opacity="0.35" />
      <line x1="282" y1="353" x2="250" y2="355" stroke="var(--flux-fluxy-fur-light)" strokeWidth="0.8" opacity="0.3" />
      <line x1="398" y1="345" x2="428" y2="338" stroke="var(--flux-fluxy-fur-light)" strokeWidth="0.8" opacity="0.35" />
      <line x1="398" y1="353" x2="430" y2="355" stroke="var(--flux-fluxy-fur-light)" strokeWidth="0.8" opacity="0.3" />

      <g style={{ animation: isThinking && !reducedMotion ? "fluxy-glasses-glow 2.5s ease infinite" : "none" }}>
        <circle cx="316" cy="312" r="26" fill="none" stroke="var(--flux-secondary)" strokeWidth="1.8" />
        <circle cx="364" cy="312" r="26" fill="none" stroke="var(--flux-secondary)" strokeWidth="1.8" />
        <line x1="342" y1="312" x2="338" y2="312" stroke="var(--flux-secondary)" strokeWidth="1.8" />
        <line x1="290" y1="308" x2="272" y2="296" stroke="var(--flux-secondary)" strokeWidth="1.8" strokeLinecap="round" />
        <line x1="390" y1="308" x2="408" y2="296" stroke="var(--flux-secondary)" strokeWidth="1.8" strokeLinecap="round" />
      </g>

      {isCelebrating ? (
        <>
          <StarSparkle cx={210} cy={240} delay={0} size={1.2} reducedMotion={reducedMotion} />
          <StarSparkle cx={470} cy={220} delay={0.5} size={1} reducedMotion={reducedMotion} />
          <StarSparkle cx={250} cy={180} delay={1} size={0.8} reducedMotion={reducedMotion} />
          <StarSparkle cx={440} cy={170} delay={1.5} size={1.1} reducedMotion={reducedMotion} />
        </>
      ) : null}

      <ellipse cx="310" cy="546" rx="26" ry="14" fill="var(--flux-fluxy-fur)" stroke="var(--flux-fluxy-fur-dark)" strokeWidth="0.8" />
      <ellipse cx="312" cy="548" rx="15" ry="8" fill="var(--flux-fluxy-face)" />
      <circle cx="305" cy="547" r="2.5" fill="var(--flux-fluxy-face-muted)" opacity="0.5" />
      <circle cx="318" cy="547" r="2.5" fill="var(--flux-fluxy-face-muted)" opacity="0.5" />

      <ellipse cx="370" cy="546" rx="26" ry="14" fill="var(--flux-fluxy-fur)" stroke="var(--flux-fluxy-fur-dark)" strokeWidth="0.8" />
      <ellipse cx="368" cy="548" rx="15" ry="8" fill="var(--flux-fluxy-face)" />
      <circle cx="362" cy="547" r="2.5" fill="var(--flux-fluxy-face-muted)" opacity="0.5" />
      <circle cx="375" cy="547" r="2.5" fill="var(--flux-fluxy-face-muted)" opacity="0.5" />

      {!isSleeping ? (
        <g opacity="0.35">
          <line x1="155" y1="385" x2="200" y2="385" stroke="var(--flux-secondary)" strokeWidth="2" strokeLinecap="round" />
          <line x1="145" y1="405" x2="195" y2="405" stroke="var(--flux-secondary)" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="160" y1="425" x2="198" y2="425" stroke="var(--flux-secondary)" strokeWidth="1" strokeLinecap="round" />
        </g>
      ) : null}
    </svg>
  );

  return (
    <span
      className={`fluxy-avatar inline-flex shrink-0 items-center justify-center ${className}`}
      data-fluxy-motion={motionAttr}
      title={title}
      aria-hidden={true}
      onMouseEnter={interactive ? () => setHovered(true) : undefined}
      onMouseLeave={interactive ? () => setHovered(false) : undefined}
      style={interactive ? { cursor: "pointer", transition: "transform 0.3s ease", transform: hoverScale } : undefined}
    >
      {svg}
    </span>
  );
}
