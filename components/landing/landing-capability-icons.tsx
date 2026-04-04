export const CAP_ICONS: Record<string, React.ReactNode> = {
  dailyInsights: (
    <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden>
      <circle cx="10" cy="10" r="4" fill="var(--flux-secondary)" fillOpacity="0.2" />
      <circle cx="10" cy="10" r="2" fill="var(--flux-secondary)" />
      <path d="M10 3v2M10 15v2M3 10h2M15 10h2M5.05 5.05l1.41 1.41M13.54 13.54l1.41 1.41M5.05 14.95l1.41-1.41M13.54 6.46l1.41-1.41" stroke="var(--flux-secondary)" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  ),
  contextOnCards: (
    <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden>
      <rect x="3" y="4" width="14" height="12" rx="2" fill="var(--flux-primary)" fillOpacity="0.15" />
      <path d="M6 8h8M6 11h5" stroke="var(--flux-primary-light)" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="14" cy="13" r="2.5" fill="var(--flux-accent)" fillOpacity="0.3" />
      <path d="M13.3 13l.7.7 1.2-1.2" stroke="var(--flux-accent)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  executiveBrief: (
    <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden>
      <path d="M4 15l3-4 3 2 3-4 3 3" stroke="var(--flux-warning)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="3" y="4" width="14" height="11" rx="1.5" stroke="var(--flux-warning)" strokeOpacity="0.4" strokeWidth="1" />
    </svg>
  ),
  portfolioAndMetrics: (
    <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden>
      <rect x="3" y="11" width="3" height="5" rx="1" fill="var(--flux-primary)" fillOpacity="0.6" />
      <rect x="8" y="8" width="3" height="8" rx="1" fill="var(--flux-secondary)" fillOpacity="0.6" />
      <rect x="13" y="5" width="3" height="11" rx="1" fill="var(--flux-accent)" fillOpacity="0.6" />
    </svg>
  ),
  discoveryAndDeals: (
    <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden>
      <circle cx="9" cy="9" r="5" stroke="var(--flux-success)" strokeWidth="1.4" strokeOpacity="0.7" />
      <path d="M13 13l3 3" stroke="var(--flux-success)" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M7 9h4M9 7v4" stroke="var(--flux-success)" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  ),
  routinesAndAlerts: (
    <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden>
      <path d="M10 3a7 7 0 110 14A7 7 0 0110 3z" stroke="var(--flux-danger)" strokeWidth="1.2" strokeOpacity="0.5" />
      <path d="M10 6v4l2.5 2.5" stroke="var(--flux-danger)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  fluxGoals: (
    <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden>
      <circle cx="10" cy="10" r="7" stroke="var(--flux-secondary)" strokeWidth="1.3" strokeOpacity="0.5" />
      <circle cx="10" cy="10" r="4" stroke="var(--flux-secondary)" strokeWidth="1.4" />
      <path d="M10 6v2.5l2 1.2" stroke="var(--flux-secondary)" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  ),
  fluxForms: (
    <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden>
      <rect x="3" y="4" width="14" height="12" rx="2" stroke="var(--flux-accent)" strokeWidth="1.2" strokeOpacity="0.7" />
      <path d="M6 9h8M6 12h5" stroke="var(--flux-accent)" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M14 14l2 2" stroke="var(--flux-accent)" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  ),
  fluxReports: (
    <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden>
      <path d="M4 14l3-3 2.5 2.5L14 8l2 2" stroke="var(--flux-primary-light)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="3" y="4" width="14" height="12" rx="1.5" stroke="var(--flux-primary)" strokeOpacity="0.35" strokeWidth="1" />
    </svg>
  ),
};
