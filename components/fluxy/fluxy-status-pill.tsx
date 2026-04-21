import type { ReactNode } from "react";

type FluxyStatusPillProps = {
  emoji: ReactNode;
  label: ReactNode;
  description?: ReactNode;
  className?: string;
};

/** Status pill (emoji + label + optional description) for Fluxy panels. */
export function FluxyStatusPill({ emoji, label, description, className = "" }: FluxyStatusPillProps) {
  return (
    <div
      className={`fluxy-ui-bounce-in-slow flex min-w-0 flex-wrap items-center justify-center gap-2.5 rounded-full border border-[var(--flux-primary-alpha-22)] bg-[color-mix(in_srgb,var(--flux-surface-card)_47%,transparent)] px-6 py-2.5 text-sm text-[var(--flux-text-muted)] backdrop-blur-[12px] font-fluxy ${className}`}
    >
      <span className="text-base" aria-hidden>
        {emoji}
      </span>
      <span className="font-semibold text-[var(--flux-text)]">{label}</span>
      {description != null ? <span className="text-xs text-[var(--flux-primary-light)]">{description}</span> : null}
    </div>
  );
}
