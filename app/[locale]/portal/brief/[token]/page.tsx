"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { FluxSurface } from "@/components/ui/flux-surface";

export default function PublicBriefPortalPage() {
  const params = useParams();
  const token = String(params.token || "");
  const [md, setMd] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/public/brief/${encodeURIComponent(token)}`, { cache: "no-store" });
        const body = (await r.json()) as { error?: string; markdown?: string; title?: string };
        if (!r.ok) throw new Error(body.error || "Falha ao carregar");
        if (!cancelled) {
          setMd(String(body.markdown || ""));
          setTitle(String(body.title || "Brief"));
        }
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Erro");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div className="min-h-screen bg-[var(--flux-surface-dark)] px-4 py-10 text-[var(--flux-text)]">
      <div className="mx-auto max-w-3xl">
        <h1 className="font-display text-xl font-semibold">{title || "…"}</h1>
        <p className="mt-1 text-xs text-[var(--flux-text-muted)]">Leitura pública — link temporário.</p>
        {err ? <p className="mt-4 text-sm text-[var(--flux-danger)]">{err}</p> : null}
        {md ? (
          <FluxSurface tier={1} className="mt-6 p-5">
            <div className="whitespace-pre-wrap text-sm leading-relaxed">{md}</div>
          </FluxSurface>
        ) : !err ? (
          <p className="mt-6 text-sm text-[var(--flux-text-muted)]">Carregando…</p>
        ) : null}
      </div>
    </div>
  );
}
