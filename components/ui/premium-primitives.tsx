import type { HTMLAttributes, ReactNode } from "react";

type PremiumSurfaceTone = "base" | "elevated" | "accent";

const surfaceToneClass: Record<PremiumSurfaceTone, string> = {
  base: "flux-premium-surface",
  elevated: "flux-premium-surface flux-premium-surface--elevated",
  accent: "flux-premium-surface flux-premium-surface--accent",
};

export type PremiumSurfaceProps = HTMLAttributes<HTMLElement> & {
  tone?: PremiumSurfaceTone;
  as?: "div" | "section";
};

export function PremiumSurface({ tone = "base", as: Component = "div", className = "", ...props }: PremiumSurfaceProps) {
  return <Component className={`${surfaceToneClass[tone]} ${className}`.trim()} {...props} />;
}

export type PremiumPageShellProps = HTMLAttributes<HTMLElement> & {
  children: ReactNode;
};

export function PremiumPageShell({ className = "", children, ...props }: PremiumPageShellProps) {
  return (
    <main className={`flux-premium-page-shell ${className}`.trim()} {...props}>
      {children}
    </main>
  );
}

export type PremiumSectionHeaderProps = {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  titleId?: string;
};

export function PremiumSectionHeader({
  eyebrow,
  title,
  description,
  action,
  className = "",
  titleId,
}: PremiumSectionHeaderProps) {
  return (
    <header className={`flux-premium-section-header ${className}`.trim()}>
      <div className="min-w-0">
        {eyebrow ? <p className="flux-premium-eyebrow">{eyebrow}</p> : null}
        <h1 id={titleId} className="flux-premium-title">
          {title}
        </h1>
        {description ? <p className="flux-premium-description">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}

export type PremiumMetricCardProps = HTMLAttributes<HTMLDivElement> & {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
};

export function PremiumMetricCard({ label, value, hint, className = "", ...props }: PremiumMetricCardProps) {
  return (
    <PremiumSurface className={`p-4 ${className}`.trim()} {...props}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--flux-text-muted)]">{label}</p>
      <p className="mt-2 font-display text-2xl font-extrabold tracking-tight text-[var(--flux-text)]">{value}</p>
      {hint ? <p className="mt-1 text-xs leading-relaxed text-[var(--flux-text-muted)]">{hint}</p> : null}
    </PremiumSurface>
  );
}
