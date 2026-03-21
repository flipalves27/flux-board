"use client";

export function DataFadeIn({
  children,
  active,
  className = "",
}: {
  children: React.ReactNode;
  active: boolean;
  className?: string;
}) {
  if (!active) return null;
  return (
    <div className={`flux-animate-data-fade-in opacity-0 ${className}`.trim()}>{children}</div>
  );
}
