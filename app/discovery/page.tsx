"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/context/toast-context";

interface DiscoveryItem {
  id: string;
  name: string;
  path: string;
  description?: string;
}

const DISCOVERIES: DiscoveryItem[] = [
  {
    id: "garantia-ia-propostas",
    name: "Garantia IA - Propostas",
    path: "/discovery/garantia-ia-propostas",
    description: "Discovery focado em propostas com garantia via IA.",
  },
];

export default function DiscoveryHomePage() {
  const router = useRouter();
  const { user, isChecked } = useAuth();
  const { pushToast } = useToast();

  useEffect(() => {
    if (!isChecked) return;
    if (!user) {
      router.replace("/login");
    }
  }, [isChecked, user, router]);

  if (!user) return null;

  return (
    <main className="max-w-[1200px] mx-auto px-6 py-8">
      <h2 className="font-display text-xl font-bold text-[var(--flux-text)] mb-6">
        Meus Discoverys
      </h2>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
        <button
          type="button"
          onClick={() => pushToast({ kind: "info", title: "Criação de novos Discoverys em breve." })}
          className="bg-[var(--flux-surface-card)] border-2 border-dashed border-[var(--flux-primary-alpha-30)] flex items-center justify-center min-h-[120px] text-[var(--flux-text-muted)] font-semibold rounded-[var(--flux-rad)] hover:bg-[var(--flux-primary-alpha-08)] hover:border-[var(--flux-primary)] hover:text-[var(--flux-primary-light)] transition-all duration-200 cursor-pointer font-display"
        >
          + Novo Discovery
        </button>

        {DISCOVERIES.map((d) => (
          <Link
            key={d.id}
            href={d.path}
            className="bg-[var(--flux-surface-card)] border border-[var(--flux-primary-alpha-20)] rounded-[var(--flux-rad)] p-5 flex flex-col gap-2 cursor-pointer transition-all hover:shadow-[var(--shadow-md)] hover:border-[var(--flux-primary)]"
          >
            <h3 className="font-display font-bold text-[var(--flux-text)]">{d.name}</h3>
            {d.description && (
              <p className="text-xs text-[var(--flux-text-muted)] leading-relaxed">
                {d.description}
              </p>
            )}
          </Link>
        ))}
      </div>
    </main>
  );
}

