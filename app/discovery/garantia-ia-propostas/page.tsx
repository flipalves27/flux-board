"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/auth-context";

export default function DiscoveryGarantiaPage() {
  const router = useRouter();
  const { user, getHeaders, isChecked } = useAuth();
  const [content, setContent] = useState<{ css: string; body: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isChecked) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    loadContent();
  }, [isChecked, user, router]);

  async function loadContent() {
    try {
      const r = await fetch("/api/discovery/garantia-ia-propostas", {
        headers: getHeaders(),
      });
      if (r.status === 401) {
        router.replace("/login");
        return;
      }
      if (!r.ok) {
        setError("Conteúdo indisponível.");
        return;
      }
      const data = await r.json();
      setContent({ css: data.css || "", body: data.body || "" });
    } catch {
      setError("Erro ao carregar o conteúdo.");
    } finally {
      setLoading(false);
    }
  }

  if (!user) return null;
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-[var(--g600)]">Carregando Discovery...</p>
      </div>
    );
  }
  if (error || !content) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-[var(--red)]">{error || "Conteúdo não encontrado."}</p>
      </div>
    );
  }

  return (
    <>
      <link
        href="https://fonts.googleapis.com/css2?family=Barlow:wght@300;400;500;600;700;800;900&family=Barlow+Condensed:wght@400;600;700&display=swap"
        rel="stylesheet"
      />
      <style dangerouslySetInnerHTML={{ __html: content.css }} />
      <div
        className="discovery-garantia-ia"
        dangerouslySetInnerHTML={{ __html: content.body }}
      />
    </>
  );
}
