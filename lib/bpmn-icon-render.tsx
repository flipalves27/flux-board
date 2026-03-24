import type { ReactNode } from "react";

export function renderBpmnIcon(icon: string, className = "w-3.5 h-3.5 opacity-95"): ReactNode {
  if (icon === "ring") {
    return (
      <svg viewBox="0 0 24 24" className={className} aria-hidden>
        <circle cx="12" cy="12" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    );
  }
  if (icon === "clock") {
    return (
      <svg viewBox="0 0 24 24" className={className} aria-hidden>
        <circle cx="12" cy="12" r="6.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <line x1="12" y1="12" x2="12" y2="8.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <line x1="12" y1="12" x2="15" y2="13.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    );
  }
  if (icon === "mail") {
    return (
      <svg viewBox="0 0 24 24" className={className} aria-hidden>
        <rect x="5" y="7" width="14" height="10" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path d="M5.8 8 L12 12.7 L18.2 8" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (icon === "play") {
    return (
      <svg viewBox="0 0 24 24" className={className} aria-hidden>
        <polygon points="9,7 17,12 9,17" fill="currentColor" />
      </svg>
    );
  }
  if (icon === "stop") {
    return (
      <svg viewBox="0 0 24 24" className={className} aria-hidden>
        <rect x="7.5" y="7.5" width="9" height="9" fill="currentColor" />
      </svg>
    );
  }
  if (icon === "x") {
    return (
      <svg viewBox="0 0 24 24" className={className} aria-hidden>
        <path d="M8 8 L16 16 M16 8 L8 16" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      </svg>
    );
  }
  if (icon === "plus") {
    return (
      <svg viewBox="0 0 24 24" className={className} aria-hidden>
        <path d="M12 7 L12 17 M7 12 L17 12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      </svg>
    );
  }
  if (icon === "circle") {
    return (
      <svg viewBox="0 0 24 24" className={className} aria-hidden>
        <circle cx="12" cy="12" r="4.5" fill="none" stroke="currentColor" strokeWidth="2" />
      </svg>
    );
  }
  if (icon === "gear") {
    return (
      <svg viewBox="0 0 24 24" className={className} aria-hidden>
        <circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path d="M12 5.5v2.1M12 16.4v2.1M5.5 12h2.1M16.4 12h2.1M7.6 7.6l1.5 1.5M14.9 14.9l1.5 1.5M16.4 7.6l-1.5 1.5M9.1 14.9l-1.5 1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    );
  }
  if (icon === "user") {
    return (
      <svg viewBox="0 0 24 24" className={className} aria-hidden>
        <circle cx="12" cy="9" r="2.6" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path d="M7.5 17.2c1.2-2.3 2.8-3.5 4.5-3.5s3.3 1.2 4.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    );
  }
  if (icon === "code") {
    return (
      <svg viewBox="0 0 24 24" className={className} aria-hidden>
        <path d="M9.5 8.2 L6.2 12 L9.5 15.8 M14.5 8.2 L17.8 12 L14.5 15.8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (icon === "replay") {
    return (
      <svg viewBox="0 0 24 24" className={className} aria-hidden>
        <path d="M8 8h7.2M15.2 8l-2.2-2.2M15.2 8L13 10.2M16 16H8.8M8.8 16l2.2 2.2M8.8 16l2.2-2.2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (icon === "plus-box") {
    return (
      <svg viewBox="0 0 24 24" className={className} aria-hidden>
        <rect x="6.5" y="6.5" width="11" height="11" rx="1.8" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path d="M12 9v6M9 12h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  if (icon === "check") {
    return (
      <svg viewBox="0 0 24 24" className={className} aria-hidden>
        <path d="M6.8 12.7 L10.3 16 L17.2 8.8" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (icon === "file") {
    return (
      <svg viewBox="0 0 24 24" className={className} aria-hidden>
        <path d="M7 5.5h7l3 3v10H7z" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path d="M14 5.5v3h3" fill="none" stroke="currentColor" strokeWidth="1.6" />
      </svg>
    );
  }
  return null;
}
