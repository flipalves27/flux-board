"use client";

import Link from "next/link";
import { useAuth } from "@/context/auth-context";

export default function DiscoveryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-[#1A202C]">
      <header className="bg-[var(--navy)] sticky top-0 z-[200]">
        <div className="max-w-[1900px] mx-auto px-6 py-3.5 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Link
              href="/boards"
              className="flex items-center gap-1.5 text-[var(--g400)] text-sm no-underline mr-2 hover:text-white transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 opacity-80">
                <rect x="3" y="3" width="7" height="7" rx="1" />
                <rect x="14" y="3" width="7" height="7" rx="1" />
                <rect x="3" y="14" width="7" height="7" rx="1" />
                <rect x="14" y="14" width="7" height="7" rx="1" />
              </svg>
              Boards
            </Link>
            <div className="w-1 h-6 bg-[var(--teal)] rounded-sm" />
            <h1 className="font-display font-extrabold text-base text-white">
              AUSTRAL <span className="text-[var(--teal)] font-semibold">SEGURADORA</span> —{" "}
              <span className="text-[var(--g300)]">Discovery</span>
            </h1>
          </div>
          <div className="flex items-center gap-3">
            {user && (
              <>
                <span className="text-sm text-[var(--g400)]">{user.name || user.username || "Usuário"}</span>
                <button type="button" onClick={logout} className="btn-ghost cursor-pointer">
                  Sair
                </button>
              </>
            )}
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}
