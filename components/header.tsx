"use client";

import Link from "next/link";
import { useAuth } from "@/context/auth-context";

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
    <header className="bg-[var(--flux-surface-mid)] border-b border-[rgba(108,92,231,0.12)] sticky top-0 z-[200]">
      <div className="w-full px-5 sm:px-6 lg:px-8 py-2.5 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          {backHref && (
            <Link
              href={backHref}
              className="text-[var(--flux-text-muted)] text-sm no-underline hover:text-[var(--flux-primary-light)] transition-colors"
            >
              {backLabel}
            </Link>
          )}
          <h1 className="font-display font-bold text-base tracking-tight text-[var(--flux-text)]">
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
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          {user && (
            <span className="text-xs text-[var(--flux-text-muted)]">
              {user.name || user.username || "Usuário"}
            </span>
          )}
          {children}
        </div>
      </div>
    </header>
  );
}
