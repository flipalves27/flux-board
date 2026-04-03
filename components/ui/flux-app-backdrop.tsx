import dynamic from "next/dynamic";

const LandingPublicBackdrop = dynamic(
  () => import("@/components/landing/landing-public-backdrop").then((mod) => mod.LandingPublicBackdrop),
  { ssr: false }
);

/**
 * Decorative layers shared with {@link AppShell}: aurora blobs + grid.
 * Use inside a `relative` full-bleed container; keep foreground content in `relative z-[1]` or above.
 * `subtle` matches the in-app shell; `immersive` usa starfield + orbs (mesmo modelo da landing v3).
 */
export function FluxAppBackdrop({
  className = "z-0",
  variant = "subtle",
}: {
  className?: string;
  variant?: "subtle" | "immersive";
}) {
  if (variant === "immersive") {
    return <LandingPublicBackdrop className={className} />;
  }

  return (
    <div className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`} aria-hidden>
      <div className="flux-aurora-bg flux-aurora-bg--subtle absolute inset-0">
        <span className="flux-aurora-blob flux-aurora-blob--a" />
        <span className="flux-aurora-blob flux-aurora-blob--b" />
        <span className="flux-aurora-blob flux-aurora-blob--c" />
      </div>
      <div className="flux-grid-overlay flux-grid-overlay--dense absolute inset-0 opacity-[0.22]" />
    </div>
  );
}
