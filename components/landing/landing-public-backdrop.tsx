"use client";

import dynamic from "next/dynamic";
import { LandingAmbientOrbs } from "./landing-ambient-orbs";

const LandingStarfield = dynamic(() => import("./landing-starfield").then((m) => m.LandingStarfield), { ssr: false });

type LandingPublicBackdropProps = {
  className?: string;
  /** Opacidade do starfield — landing/login mais forte; app interno um pouco mais suave para leitura. */
  starfieldClassName?: string;
};

/**
 * Fundo redesign v3: canvas starfield + orbs (sem aurora/malha).
 * Landing, login, shell da plataforma e páginas públicas.
 */
export function LandingPublicBackdrop({
  className = "",
  starfieldClassName = "opacity-[0.52]",
}: LandingPublicBackdropProps) {
  return (
    <div className={`pointer-events-none absolute inset-0 z-0 min-h-full overflow-hidden ${className}`.trim()} aria-hidden>
      <LandingStarfield className={starfieldClassName} />
      <LandingAmbientOrbs />
    </div>
  );
}
