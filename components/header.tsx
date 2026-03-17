"use client";

import Link from "next/link";
import { useAuth } from "@/context/auth-context";

function FluxLogoIcon({ className = "w-8 h-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 44 44" fill="none" className={className} aria-hidden>
      <path d="M8 32L16 20L24 26L36 10" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M30 10H36V16" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="16" cy="20" r="2.5" fill="rgba(253,167,223,0.8)" />
      <circle cx="24" cy="26" r="2.5" fill="rgba(0,210,211,0.8)" />
      <path d="M8 36H36" stroke="rgba(255,255,255,0.3)" strokeWidth="1" strokeLinecap="round" />
    </svg>
  );
}

interface HeaderProps {
  title?: string;
  backHref?: string;
  backLabel?: string;
  hideDiscovery?: boolean;
  children?: React.ReactNode;
}

export function Header({ title = "Flux-Board", backHref, backLabel = "← Boards", hideDiscovery, children }: HeaderProps) {
  const { user } = useAuth();

  return (
    <header className="bg-[var(--flux-surface-mid)] border-b border-[rgba(108,92,231,0.2)] sticky top-0 z-[200]">
      <div className="max-w-[1900px] mx-auto px-6 py-4 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          {backHref && (
            <Link
              href={backHref}
              className="text-[var(--flux-text-muted)] text-sm no-underline mr-2 hover:text-[var(--flux-primary-light)] transition-colors"
            >
              {backLabel}
            </Link>
          )}
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-[10px] flex items-center justify-center flex-shrink-0"
              style={{
                background: "linear-gradient(135deg, var(--flux-primary), var(--flux-primary-dark))",
                boxShadow: "0 8px 32px rgba(108,92,231,0.4)",
              }}
            >
              <FluxLogoIcon className="w-5 h-5" />
            </div>
            <h1 className="font-display font-bold text-lg tracking-tight text-[var(--flux-text)]">
              <span
                className="bg-clip-text text-transparent"
                style={{
                  backgroundImage: "linear-gradient(135deg, var(--flux-text) 0%, var(--flux-primary-light) 100%)",
                }}
              >
                Flux-Board
              </span>
              {title && title !== "Flux-Board" && (
                <span className="text-[var(--flux-text-muted)] font-medium"> — {title}</span>
              )}
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {user && (
            <span className="text-sm text-[var(--flux-text-muted)]">
              {user.name || user.username || "Usuário"}
            </span>
          )}
          {children}
        </div>
      </div>
    </header>
  );
}
