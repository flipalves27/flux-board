"use client";

import { brandMarkInitials } from "@/lib/brand-mark-initials";

export type FluxBrandMarkVariant = "landing" | "auth" | "app" | "mobile";

const variantClass: Record<FluxBrandMarkVariant, string> = {
  landing: "h-[30px] w-[30px] rounded-[9px] text-[11px] sm:h-9 sm:w-9 sm:rounded-[10px] sm:text-xs",
  auth: "h-10 w-10 rounded-[10px] text-xs",
  app: "h-8 w-8 rounded-[10px] text-[10px]",
  mobile: "h-7 w-7 rounded-[8px] text-[9px]",
};

type FluxBrandMarkProps = {
  platformName: string;
  logoUrl?: string | null;
  variant?: FluxBrandMarkVariant;
  className?: string;
};

/**
 * Selo da marca (gradiente primário → secundário + iniciais), alinhado à landing v3.
 * Com `logoUrl`, exibe a imagem no mesmo recorte.
 */
export function FluxBrandMark({ platformName, logoUrl, variant = "app", className = "" }: FluxBrandMarkProps) {
  const trimmed = logoUrl?.trim();
  const initials = brandMarkInitials(platformName);
  const vClass = variantClass[variant];

  return (
    <div
      className={`flex shrink-0 items-center justify-center overflow-hidden font-display font-extrabold leading-none tracking-tight ${vClass} ${className}`.trim()}
      style={{
        background: trimmed ? "var(--flux-surface-elevated)" : "linear-gradient(135deg, var(--flux-primary), var(--flux-secondary))",
        boxShadow: trimmed
          ? "none"
          : variant === "landing"
            ? "0 8px 20px color-mix(in srgb, var(--flux-primary) 35%, transparent)"
            : variant === "auth"
              ? "0 8px 28px color-mix(in srgb, var(--flux-primary) 35%, transparent)"
              : variant === "mobile"
                ? "0 2px 10px color-mix(in srgb, var(--flux-primary) 28%, transparent)"
                : "0 2px 8px color-mix(in srgb, var(--flux-primary) 25%, transparent)",
      }}
      aria-hidden
    >
      {trimmed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={trimmed} alt="" className="max-h-[85%] max-w-[85%] object-contain" />
      ) : (
        <span className="text-[var(--flux-surface-dark)]">{initials}</span>
      )}
    </div>
  );
}
