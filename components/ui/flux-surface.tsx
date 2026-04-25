import type { ButtonHTMLAttributes, HTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

const tierClass = {
  1: "flux-surface-1",
  2: "flux-surface-2",
  3: "flux-surface-3",
} as const;

export type FluxSurfaceTier = keyof typeof tierClass;
export type FluxTone = "neutral" | "success" | "warning" | "attention" | "danger" | "blocked" | "overdue" | "risk" | "ai" | "info";

export type FluxSurfaceProps = HTMLAttributes<HTMLDivElement> & {
  tier?: FluxSurfaceTier;
};

/**
 * Superfícies semânticas Onda 4 — classes definidas em `app/globals.css`.
 */
export function FluxSurface({ tier = 1, className = "", ...rest }: FluxSurfaceProps) {
  const base = tierClass[tier];
  return <div className={`${base} ${className}`.trim()} {...rest} />;
}

export type FluxCardProps = FluxSurfaceProps & {
  interactive?: boolean;
};

export function FluxCard({ tier = 1, interactive = false, className = "", ...rest }: FluxCardProps) {
  return (
    <FluxSurface
      tier={tier}
      className={`${interactive ? "flux-motion-standard hover:border-[var(--flux-primary-alpha-35)] hover:shadow-[var(--flux-shadow-panel-hover)]" : ""} ${className}`.trim()}
      {...rest}
    />
  );
}

export type FluxBadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: FluxTone;
};

export function FluxBadge({ tone = "neutral", className = "", ...rest }: FluxBadgeProps) {
  return <span className={`flux-badge ${className}`.trim()} data-tone={tone} {...rest} />;
}

export type FluxCalloutProps = HTMLAttributes<HTMLDivElement> & {
  tone?: Extract<FluxTone, "neutral" | "attention" | "danger" | "ai" | "info" | "warning">;
};

export function FluxCallout({ tone = "neutral", className = "", ...rest }: FluxCalloutProps) {
  const normalizedTone = tone === "warning" || tone === "info" ? "attention" : tone;
  return <div className={`flux-callout p-4 ${className}`.trim()} data-tone={normalizedTone} {...rest} />;
}

export type FluxButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
};

const buttonClass: Record<NonNullable<FluxButtonProps["variant"]>, string> = {
  primary: "btn-primary",
  secondary: "btn-secondary",
  ghost: "btn-ghost",
  danger: "btn-danger",
};

export function FluxButton({ variant = "secondary", className = "", ...rest }: FluxButtonProps) {
  return <button className={`${buttonClass[variant]} ${className}`.trim()} {...rest} />;
}

export type FluxFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
};

export function FluxField({ label, hint, error, className = "", id, ...rest }: FluxFieldProps) {
  return (
    <label className="block">
      {label ? <span className="flux-product-label mb-2 block">{label}</span> : null}
      <input id={id} className={`flux-input w-full rounded-xl border border-[var(--flux-control-border)] bg-[var(--flux-surface-raised)] px-4 py-3 text-sm text-[var(--flux-text)] placeholder:text-[var(--flux-text-muted)] ${className}`.trim()} {...rest} />
      {error ? (
        <span className="mt-1.5 block text-xs font-medium text-[var(--flux-danger)]">{error}</span>
      ) : hint ? (
        <span className="mt-1.5 block text-xs text-[var(--flux-text-muted)]">{hint}</span>
      ) : null}
    </label>
  );
}
