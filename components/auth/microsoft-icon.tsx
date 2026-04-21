/** Logo Microsoft (quatro quadrados). */
export function MicrosoftIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 21 21" aria-hidden>
      <path fill="var(--flux-oauth-ms-red)" d="M1 1h9v9H1z" />
      <path fill="var(--flux-oauth-ms-cyan)" d="M11 1h9v9h-9z" />
      <path fill="var(--flux-oauth-ms-green)" d="M1 11h9v9H1z" />
      <path fill="var(--flux-oauth-ms-yellow)" d="M11 11h9v9h-9z" />
    </svg>
  );
}
