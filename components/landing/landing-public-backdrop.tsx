"use client";

import dynamic from "next/dynamic";
import { LandingAmbientOrbs } from "./landing-ambient-orbs";

const LandingStarfield = dynamic(() => import("./landing-starfield").then((m) => m.LandingStarfield), { ssr: false });

/**
 * Fundo público alinhado ao redesign v3: canvas starfield + orbs grandes (sem aurora/malha/SVG).
 * Usado na landing e no login.
 */
export function LandingPublicBackdrop({ className = "" }: { className?: string }) {
  return (
    <div className={`pointer-events-none absolute inset-0 z-0 min-h-[100dvh] overflow-hidden ${className}`.trim()} aria-hidden>
      <LandingStarfield className="opacity-[0.52]" />
      <LandingAmbientOrbs />
    </div>
  );
}
