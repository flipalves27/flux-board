export function FluxLogoIcon({ className = "w-8 h-8" }: { className?: string }) {
  return (
    <svg viewBox="0 -4 44 48" fill="none" className={className} aria-hidden>
      <path d="M8 32L16 20L24 26L36 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M30 10H36V16" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="16" cy="20" r="2.5" fill="var(--flux-accent)" />
      <circle cx="24" cy="26" r="2.5" fill="var(--flux-secondary)" />
      <path d="M8 36H36" stroke="currentColor" strokeOpacity="0.3" strokeWidth="1" strokeLinecap="round" />
    </svg>
  );
}
