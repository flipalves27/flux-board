"use client";

export function DataFadeIn({
  children,
  active,
  className = "",
  /** When false, no opacity-0 → fade-in (avoids a blank flash on remount). */
  animate = true,
}: {
  children: React.ReactNode;
  active: boolean;
  className?: string;
  animate?: boolean;
}) {
  if (!active) return null;
  if (!animate) {
    return <div className={className.trim()}>{children}</div>;
  }
  return (
    <div className={`flux-animate-data-fade-in opacity-0 ${className}`.trim()}>{children}</div>
  );
}
