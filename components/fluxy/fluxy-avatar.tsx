"use client";

import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { FluxyAvatarSize, FluxyAvatarState } from "@/components/fluxy/fluxy-types";

const SIZE_PX: Record<FluxyAvatarSize, number> = {
  fab: 40,
  compact: 64,
  header: 96,
};

const HEART_X = [168, 192, 212, 232, 248] as const;

const MOUTH_PATHS = [
  "M232 296 Q250 305 268 296",
  "M234 293 Q250 304 266 293",
  "M236 295 Q250 300 264 295",
  "M234 294 Q250 306 266 294",
] as const;

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
      Array.from({ length: 24 }, (_, i) => ({
        id: i,
        x: 110 + ((i * 53) % 290),
        delay: (i * 0.06) % 1.4,
        dur: 1.2 + (i % 5) * 0.2,
        colorVar: ["--flux-fluxy-fur", "--flux-secondary", "--flux-accent", "--flux-fluxy-fur-light", "--flux-fluxy-face"][i % 5],
        size: 3 + (i % 5),
        r: (i * 47) % 360,
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
          y={-12}
          width={p.size}
          height={p.size * 0.55}
          rx={1}
          fill={`var(${p.colorVar})`}
          opacity={0.85}
          transform={`rotate(${p.r} ${p.x} -12)`}
          style={{ animation: `fluxy-confetti-fall ${p.dur}s ease-in ${p.delay}s infinite` }}
        />
      ))}
    </g>
  );
}

type HeartsLoveProps = { reducedMotion: boolean };

function FluxyLoveHearts({ reducedMotion }: HeartsLoveProps) {
  if (reducedMotion) {
    return (
      <g>
        {[0, 1, 2].map((i) => (
          <text key={i} x={200 + i * 55} y={138} fontSize={16} fill="var(--flux-accent)" opacity={0.75}>
            ♥
          </text>
        ))}
      </g>
    );
  }
  return (
    <g>
      {[0, 1, 2].map((i) => (
        <text
          key={i}
          x={200 + i * 55}
          y={138}
          fontSize={18}
          fill="var(--flux-accent)"
          opacity={0.85}
          style={{ animation: `fluxy-heart-float 2s ease-in-out ${i * 0.5}s infinite` }}
        >
          ♥
        </text>
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

export function FluxyAvatar({
  state,
  size = "compact",
  className = "",
  showConfetti = false,
  title,
  interactive = false,
}: FluxyAvatarProps) {
  const reducedMotion = usePrefersReducedMotion();
  const loadGradId = useId().replace(/:/g, "");
  const [blinkOpen, setBlinkOpen] = useState(true);
  const [mouthFrame, setMouthFrame] = useState(0);
  const [loadProg, setLoadProg] = useState(0);
  const [hovered, setHovered] = useState(false);
  const talkRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const loadRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (reducedMotion || state === "sleeping") return;
    const id = window.setInterval(() => {
      setBlinkOpen(false);
      window.setTimeout(() => setBlinkOpen(true), 130);
    }, 2800 + Math.random() * 2000);
    return () => window.clearInterval(id);
  }, [reducedMotion, state]);

  useEffect(() => {
    if (talkRef.current) clearInterval(talkRef.current);
    if (loadRef.current) clearInterval(loadRef.current);
    setMouthFrame(0);
    setLoadProg(0);

    if (reducedMotion) return;

    if (state === "talking") {
      talkRef.current = setInterval(() => setMouthFrame((p) => (p + 1) % 4), 160);
    }
    if (state === "loading") {
      loadRef.current = setInterval(() => setLoadProg((p) => (p >= 100 ? 0 : p + 2)), 60);
    }

    return () => {
      if (talkRef.current) clearInterval(talkRef.current);
      if (loadRef.current) clearInterval(loadRef.current);
    };
  }, [state, reducedMotion]);

  const isSleeping = state === "sleeping";
  const isCelebrating = state === "celebrating";
  const isThinking = state === "thinking";
  const isTalking = state === "talking";
  const isWaving = state === "waving";
  const isError = state === "error";
  const isLoading = state === "loading";
  const isPointing = state === "pointing";
  const isLove = state === "love";

  const w = SIZE_PX[size];
  const motionAttr = reducedMotion ? "reduced" : "ok";

  const rootAnim = reducedMotion
    ? "none"
    : isCelebrating
      ? "fluxy-bounce 0.6s ease infinite"
      : isError
        ? "fluxy-error-shake 0.4s ease infinite"
        : isSleeping
          ? "fluxy-breathe-slow 5s ease-in-out infinite"
          : "fluxy-breathe 4s ease-in-out infinite";

  const showHeartsInteractive = interactive && hovered && !isSleeping && !reducedMotion && !isLove;
  const hoverScale = interactive && !isSleeping && hovered ? "scale(1.03)" : "scale(1)";

  const loadBarW = reducedMotion ? 45 : loadProg * 1.2;

  const svg = (
    <svg
      width={w}
      viewBox="0 0 500 520"
      className="max-w-full overflow-visible"
      style={{
        animation: rootAnim,
        filter: isSleeping ? "brightness(0.7) saturate(0.65)" : "none",
        transition: "filter 0.5s ease",
        display: "block",
        height: "auto",
      }}
    >
      <defs>
        <linearGradient id={loadGradId} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="var(--flux-fluxy-fur)" />
          <stop offset="100%" stopColor="var(--flux-secondary)" />
        </linearGradient>
      </defs>

      <FluxyConfetti active={Boolean(showConfetti && isCelebrating)} reducedMotion={reducedMotion} />
      {isLove ? <FluxyLoveHearts reducedMotion={reducedMotion} /> : null}

      {showHeartsInteractive
        ? HEART_X.map((x, i) => (
            <text
              key={i}
              x={x}
              y={495}
              fontSize={15}
              fill="var(--flux-accent)"
              style={{ animation: `fluxy-heart-rise 2.5s ease-out ${i * 0.5}s infinite` }}
            >
              ♥
            </text>
          ))
        : null}

      {/* Tail */}
      <g
        style={{
          transformOrigin: "170px 400px",
          animation: reducedMotion
            ? "none"
            : isCelebrating
              ? "fluxy-tail-wag-fast 0.4s ease infinite"
              : isSleeping
                ? "none"
                : "fluxy-tail-wag 2.5s ease-in-out infinite",
        }}
      >
        <path
          d="M160 410 Q100 340, 115 275 Q122 250, 148 265 Q170 285, 165 340 Q162 375, 160 400Z"
          fill="var(--flux-fluxy-fur)"
          stroke="var(--flux-fluxy-fur-dark)"
          strokeWidth="1"
        />
        <path
          d="M162 395 Q120 345, 135 290 Q142 270, 155 280 Q165 300, 160 350Z"
          fill="var(--flux-fluxy-fur-light)"
          opacity="0.4"
        />
        <path d="M117 278 Q112 258, 125 252 Q133 256, 129 270Z" fill="var(--flux-secondary)" />
      </g>

      {/* Body */}
      <ellipse cx="250" cy="395" rx="68" ry="58" fill="var(--flux-fluxy-fur)" stroke="var(--flux-fluxy-fur-dark)" strokeWidth="1" />
      <ellipse cx="250" cy="402" rx="42" ry="37" fill="var(--flux-fluxy-face)" />

      {/* Left arm */}
      <path
        d="M195 370 Q176 382, 174 400 Q172 414, 188 414"
        fill="var(--flux-fluxy-fur)"
        stroke="var(--flux-fluxy-fur-dark)"
        strokeWidth="1"
      />
      <ellipse cx="188" cy="416" rx="10" ry="6" fill="var(--flux-fluxy-face)" />

      {/* Right arm */}
      {isWaving ? (
        <g style={{ transformOrigin: "310px 370px", animation: reducedMotion ? "none" : "fluxy-wave-arm 0.8s ease-in-out infinite" }}>
          <path
            d="M305 365 Q325 345, 338 325 Q342 318, 336 316"
            fill="var(--flux-fluxy-fur)"
            stroke="var(--flux-fluxy-fur-dark)"
            strokeWidth="1"
          />
          <ellipse cx="336" cy="314" rx="9" ry="6" fill="var(--flux-fluxy-face)" />
        </g>
      ) : isPointing ? (
        <g style={{ animation: reducedMotion ? "none" : "fluxy-point-pulse 1.2s ease-in-out infinite" }}>
          <path
            d="M305 368 Q335 355, 360 345 Q368 342, 372 348"
            fill="var(--flux-fluxy-fur)"
            stroke="var(--flux-fluxy-fur-dark)"
            strokeWidth="1"
          />
          <ellipse cx="374" cy="349" rx="8" ry="5" fill="var(--flux-fluxy-face)" />
          <circle cx="395" cy="345" r="4" fill="var(--flux-secondary)" opacity="0.6" />
          <circle cx="405" cy="342" r="2.5" fill="var(--flux-secondary)" opacity="0.4" />
        </g>
      ) : (
        <g>
          <path
            d="M305 368 Q322 355, 332 340 Q336 334, 330 332"
            fill="var(--flux-fluxy-fur)"
            stroke="var(--flux-fluxy-fur-dark)"
            strokeWidth="1"
          />
          <ellipse cx="330" cy="330" rx="9" ry="6" fill="var(--flux-fluxy-face)" />
        </g>
      )}

      {/* Legs */}
      <path
        d="M228 445 Q224 466, 220 478 Q218 485, 224 486"
        fill="var(--flux-fluxy-fur)"
        stroke="var(--flux-fluxy-fur-dark)"
        strokeWidth="1"
      />
      <ellipse cx="228" cy="488" rx="18" ry="7" fill="var(--flux-fluxy-fur)" stroke="var(--flux-fluxy-fur-dark)" strokeWidth="0.8" />
      <ellipse cx="230" cy="489" rx="10" ry="4" fill="var(--flux-fluxy-face)" />

      <path
        d="M272 445 Q276 466, 278 478 Q280 485, 274 486"
        fill="var(--flux-fluxy-fur)"
        stroke="var(--flux-fluxy-fur-dark)"
        strokeWidth="1"
      />
      <ellipse cx="274" cy="488" rx="18" ry="7" fill="var(--flux-fluxy-fur)" stroke="var(--flux-fluxy-fur-dark)" strokeWidth="0.8" />
      <ellipse cx="272" cy="489" rx="10" ry="4" fill="var(--flux-fluxy-face)" />

      {/* Head */}
      <ellipse cx="250" cy="280" rx="62" ry="55" fill="var(--flux-fluxy-fur)" stroke="var(--flux-fluxy-fur-dark)" strokeWidth="1" />

      <ellipse cx="210" cy="295" rx="12" ry="8" fill="var(--flux-accent)" opacity="0.18" />
      <ellipse cx="290" cy="295" rx="12" ry="8" fill="var(--flux-accent)" opacity="0.18" />

      {/* Ears */}
      <path d="M200 245 L185 190 L220 235Z" fill="var(--flux-fluxy-fur)" stroke="var(--flux-fluxy-fur-dark)" strokeWidth="1" />
      <path d="M205 240 L194 202 L216 234Z" fill="var(--flux-fluxy-face)" opacity="0.7" />
      <path d="M193 200 L187 192 L198 208Z" fill="var(--flux-secondary)" />

      <path d="M300 245 L315 190 L280 235Z" fill="var(--flux-fluxy-fur)" stroke="var(--flux-fluxy-fur-dark)" strokeWidth="1" />
      <path d="M295 240 L306 202 L284 234Z" fill="var(--flux-fluxy-face)" opacity="0.7" />
      <path d="M307 200 L313 192 L302 208Z" fill="var(--flux-secondary)" />

      {/* Snout */}
      <ellipse cx="250" cy="288" rx="22" ry="16" fill="var(--flux-fluxy-face)" />
      <ellipse cx="250" cy="281" rx="7" ry="5" fill="var(--flux-fluxy-fur-dark)" />

      {/* Eyes */}
      {isSleeping ? (
        <>
          <path d="M224 270 Q232 276, 240 270" fill="none" stroke="var(--flux-fluxy-fur-dark)" strokeWidth="2" strokeLinecap="round" />
          <path d="M260 270 Q268 276, 276 270" fill="none" stroke="var(--flux-fluxy-fur-dark)" strokeWidth="2" strokeLinecap="round" />
        </>
      ) : !blinkOpen ? (
        <>
          <path d="M224 272 Q232 276, 240 272" fill="none" stroke="var(--flux-fluxy-fur-dark)" strokeWidth="2" strokeLinecap="round" />
          <path d="M260 272 Q268 276, 276 272" fill="none" stroke="var(--flux-fluxy-fur-dark)" strokeWidth="2" strokeLinecap="round" />
        </>
      ) : (
        <>
          <circle cx="232" cy="270" r="8" fill="var(--flux-text-on-primary)" stroke="var(--flux-fluxy-fur-dark)" strokeWidth="1" />
          <circle
            cx={isPointing ? 234 : isError ? 230 : 233}
            cy={isError ? 271 : 269}
            r="4.5"
            fill="var(--flux-fluxy-eye)"
          />
          <circle cx={isPointing ? 235 : 234} cy="267" r="1.5" fill="var(--flux-text-on-primary)" />

          <circle cx="268" cy="270" r="8" fill="var(--flux-text-on-primary)" stroke="var(--flux-fluxy-fur-dark)" strokeWidth="1" />
          <circle cx={isPointing ? 270 : isError ? 266 : 269} cy={isError ? 271 : 269} r="4.5" fill="var(--flux-fluxy-eye)" />
          <circle cx={isPointing ? 271 : 270} cy="267" r="1.5" fill="var(--flux-text-on-primary)" />
        </>
      )}

      {isError ? (
        <>
          <line x1="222" y1="258" x2="238" y2="262" stroke="var(--flux-fluxy-fur-dark)" strokeWidth="2" strokeLinecap="round" />
          <line x1="278" y1="262" x2="262" y2="258" stroke="var(--flux-fluxy-fur-dark)" strokeWidth="2" strokeLinecap="round" />
        </>
      ) : null}

      {/* Glasses */}
      <circle
        cx="232"
        cy="270"
        r="14"
        fill="none"
        stroke="var(--flux-secondary)"
        strokeWidth="1.8"
        opacity={isThinking ? 1 : 0.8}
        style={{
          animation:
            reducedMotion || !isThinking ? "none" : "fluxy-pulse-glow 1.5s ease infinite",
        }}
      />
      <circle
        cx="268"
        cy="270"
        r="14"
        fill="none"
        stroke="var(--flux-secondary)"
        strokeWidth="1.8"
        opacity={isThinking ? 1 : 0.8}
        style={{
          animation:
            reducedMotion || !isThinking ? "none" : "fluxy-pulse-glow 1.5s ease infinite",
        }}
      />
      <line x1="246" y1="270" x2="254" y2="270" stroke="var(--flux-secondary)" strokeWidth="1.5" />
      <line x1="218" y1="266" x2="202" y2="258" stroke="var(--flux-secondary)" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="282" y1="266" x2="298" y2="258" stroke="var(--flux-secondary)" strokeWidth="1.5" strokeLinecap="round" />

      {/* Mouth */}
      {isSleeping ? (
        <path d="M242 298 Q250 302 258 298" fill="none" stroke="var(--flux-fluxy-fur-dark)" strokeWidth="1.2" strokeLinecap="round" />
      ) : isCelebrating || isLove ? (
        <path
          d="M232 294 Q250 312 268 294"
          fill="var(--flux-fluxy-face)"
          stroke="var(--flux-fluxy-fur-dark)"
          strokeWidth="1"
        />
      ) : (
        <path
          d={MOUTH_PATHS[isTalking ? mouthFrame : 0]}
          fill="none"
          stroke="var(--flux-fluxy-fur-dark)"
          strokeWidth={isTalking ? 1.5 : 1.2}
          strokeLinecap="round"
        />
      )}

      {isThinking ? (
        <>
          <g style={{ transformOrigin: "250px 180px", animation: reducedMotion ? "none" : "fluxy-orb-spin 3s linear infinite" }}>
            <circle cx="220" cy="180" r="6" fill="var(--flux-secondary)" opacity="0.7" />
            <circle cx="280" cy="180" r="4" fill="var(--flux-accent)" opacity="0.6" />
            <circle cx="250" cy="165" r="5" fill="var(--flux-fluxy-fur-light)" opacity="0.65" />
          </g>
          <g style={{ transformOrigin: "250px 185px", animation: reducedMotion ? "none" : "fluxy-orb-spin-reverse 4s linear infinite" }}>
            <circle cx="235" cy="170" r="3" fill="var(--flux-accent)" opacity="0.5" />
            <circle cx="265" cy="175" r="3.5" fill="var(--flux-secondary)" opacity="0.5" />
          </g>
          {[0, 1, 2].map((i) => (
            <circle
              key={i}
              cx={238 + i * 12}
              cy="315"
              r="2.5"
              fill="var(--flux-secondary)"
              style={{ animation: reducedMotion ? "none" : `fluxy-dot-pulse 1s ease ${i * 0.25}s infinite` }}
            />
          ))}
        </>
      ) : null}

      {isTalking ? (
        <>
          {[0, 1, 2].map((i) => (
            <path
              key={i}
              d={`M${298 + i * 8} 290 Q${305 + i * 8} 296 ${298 + i * 8} 302`}
              fill="none"
              stroke="var(--flux-secondary)"
              strokeWidth="1.2"
              opacity="0.5"
              style={{ animation: reducedMotion ? "none" : `fluxy-sound-wave 0.8s ease ${i * 0.2}s infinite` }}
            />
          ))}
        </>
      ) : null}

      {isSleeping
        ? [0, 1, 2].map((i) => (
            <text
              key={i}
              x={290 + i * 18}
              y={240 - i * 15}
              fontSize={12 + i * 3}
              fill="var(--flux-fluxy-fur-light)"
              opacity="0.6"
              style={{
                fontFamily: "var(--font-fluxy), ui-monospace, monospace",
                fontWeight: 600,
                animation: reducedMotion ? "none" : `fluxy-z-float 2.5s ease ${i * 0.6}s infinite`,
              }}
            >
              z
            </text>
          ))
        : null}

      {isLoading ? (
        <g>
          <rect
            x="190"
            y="315"
            width="120"
            height="6"
            rx="3"
            fill="color-mix(in srgb, var(--flux-fluxy-fur) 18%, transparent)"
          />
          <rect
            x="190"
            y="315"
            width={loadBarW}
            height="6"
            rx="3"
            fill={`url(#${loadGradId})`}
            style={{ transition: reducedMotion ? undefined : "width 0.06s linear" }}
          />
          <text
            x="250"
            y="336"
            textAnchor="middle"
            fontSize="10"
            fontFamily="ui-monospace, monospace"
            fill="var(--flux-secondary)"
          >
            {reducedMotion ? "…" : `${loadProg}%`}
          </text>
        </g>
      ) : null}

      {isError ? (
        <g>
          <circle cx="320" cy="230" r="14" fill="var(--flux-accent)" opacity="0.2" />
          <text
            x="320"
            y="236"
            textAnchor="middle"
            fontSize="18"
            fontWeight="700"
            fill="var(--flux-accent)"
            style={{ fontFamily: "var(--font-fluxy), system-ui, sans-serif" }}
          >
            !
          </text>
        </g>
      ) : null}

      {isPointing ? (
        <g style={{ animation: reducedMotion ? "none" : "fluxy-pulse-glow 1.5s ease infinite" }}>
          <circle cx="400" cy="340" r="8" fill="var(--flux-secondary)" opacity="0.15" />
          <line x1="400" y1="332" x2="400" y2="348" stroke="var(--flux-secondary)" strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
          <line x1="392" y1="340" x2="408" y2="340" stroke="var(--flux-secondary)" strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
        </g>
      ) : null}

      {(state === "idle" || isPointing) && (
        <g
          transform="translate(148, 400)"
          style={{ animation: reducedMotion ? "none" : "fluxy-float-card 3.5s ease-in-out infinite" }}
        >
          <rect x="0" y="0" width="34" height="24" rx="3" fill="var(--flux-fluxy-void)" stroke="var(--flux-secondary)" strokeWidth="0.8" />
          <rect x="4" y="4" width="16" height="2" rx="1" fill="var(--flux-fluxy-fur-light)" opacity="0.6" />
          <rect x="4" y="9" width="12" height="2" rx="1" fill="var(--flux-secondary)" opacity="0.4" />
          <rect x="4" y="14" width="8" height="2" rx="1" fill="var(--flux-accent)" opacity="0.4" />
          <path
            d="M24 16 L26 18 L30 12"
            fill="none"
            stroke="var(--flux-secondary)"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
        </g>
      )}

      {isCelebrating ? (
        <>
          <StarSparkle cx={155} cy={205} delay={0} size={1.1} reducedMotion={reducedMotion} />
          <StarSparkle cx={345} cy={190} delay={0.5} size={0.95} reducedMotion={reducedMotion} />
          <StarSparkle cx={175} cy={165} delay={1} size={0.85} reducedMotion={reducedMotion} />
          <StarSparkle cx={330} cy={155} delay={1.5} size={1} reducedMotion={reducedMotion} />
        </>
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
