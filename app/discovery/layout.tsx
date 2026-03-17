"use client";

import { useAuth } from "@/context/auth-context";
import { Header } from "@/components/header";

export default function DiscoveryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[var(--flux-surface-dark)]">
      <Header title="Discovery" />
      {children}
    </div>
  );
}
