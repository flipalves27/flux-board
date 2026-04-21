import { LandingPublicBackdrop } from "@/components/landing/landing-public-backdrop";

/**
 * Fundo global alinhado à tela principal (starfield + orbs v3).
 * `immersive` — opacidade plena (login, marketing).
 * `subtle` — starfield um pouco mais suave no app autenticado (boards, relatórios, etc.).
 */
export function FluxAppBackdrop({
  className = "z-0",
  variant = "subtle",
}: {
  className?: string;
  variant?: "subtle" | "immersive";
}) {
  const starfieldClassName = variant === "immersive" ? "opacity-[0.52]" : "opacity-[0.46]";
  return <LandingPublicBackdrop className={className} starfieldClassName={starfieldClassName} />;
}
