/**
 * Orbs difusos como no HTML v3 — blur forte, opacidade ~0.35, drift lento.
 */
export function LandingAmbientOrbs({ className = "" }: { className?: string }) {
  return (
    <div className={`landing-v3-orbs ${className}`.trim()} aria-hidden>
      <div className="landing-v3-orb landing-v3-orb--1" />
      <div className="landing-v3-orb landing-v3-orb--2" />
      <div className="landing-v3-orb landing-v3-orb--3" />
    </div>
  );
}
