"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams } from "next/navigation";

type PublicFormData = {
  enabled: boolean;
  slug: string;
  title: string;
  description?: string;
};

export default function PublicIntakeFormPage() {
  const params = useParams();
  const slug = String(params.slug || "");
  const [form, setForm] = useState<PublicFormData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const [requesterName, setRequesterName] = useState("");
  const [requesterEmail, setRequesterEmail] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const r = await fetch(`/api/forms/${encodeURIComponent(slug)}`, { cache: "no-store" });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(String(data.error || "Formulário indisponível."));
        if (!cancelled) setForm(data.form || null);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Erro ao carregar.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    if (slug) load();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const r = await fetch(`/api/forms/${encodeURIComponent(slug)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requesterName,
          requesterEmail,
          title,
          description,
          tags: tags
            .split(",")
            .map((v) => v.trim())
            .filter(Boolean),
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(String(data.error || "Falha ao enviar."));
      setDone(true);
      setRequesterName("");
      setRequesterEmail("");
      setTitle("");
      setDescription("");
      setTags("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao enviar.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-[var(--flux-surface-dark)] px-4 py-10">
      <div className="max-w-[760px] mx-auto rounded-[var(--flux-rad)] border border-[var(--flux-primary-alpha-24)] bg-[var(--flux-surface-card)] p-6 md:p-8">
        {loading && <p className="text-[var(--flux-text-muted)]">Carregando formulário...</p>}
        {!loading && error && <p className="text-[var(--flux-danger)]">{error}</p>}
        {!loading && !error && form && (
          <>
            <h1 className="font-display text-2xl font-bold text-[var(--flux-text)]">{form.title}</h1>
            {form.description && <p className="mt-2 text-sm text-[var(--flux-text-muted)]">{form.description}</p>}
            {done && (
              <p className="mt-4 rounded-[var(--flux-rad-sm)] border border-[var(--flux-success-alpha-40)] bg-[var(--flux-success-alpha-12)] px-3 py-2 text-sm text-[var(--flux-text)]">
                Demanda enviada com sucesso. Seu card já foi criado no board.
              </p>
            )}
            <form onSubmit={onSubmit} className="mt-6 grid gap-4">
              <label className="grid gap-1 text-sm text-[var(--flux-text)]">
                Nome
                <input
                  required
                  value={requesterName}
                  onChange={(e) => setRequesterName(e.target.value)}
                  className="rounded-[var(--flux-rad-sm)] border border-[var(--flux-chrome-alpha-16)] bg-[var(--flux-surface-elevated)] px-3 py-2 text-[var(--flux-text)] outline-none focus:border-[var(--flux-primary)]"
                />
              </label>
              <label className="grid gap-1 text-sm text-[var(--flux-text)]">
                E-mail (opcional)
                <input
                  type="email"
                  value={requesterEmail}
                  onChange={(e) => setRequesterEmail(e.target.value)}
                  className="rounded-[var(--flux-rad-sm)] border border-[var(--flux-chrome-alpha-16)] bg-[var(--flux-surface-elevated)] px-3 py-2 text-[var(--flux-text)] outline-none focus:border-[var(--flux-primary)]"
                />
              </label>
              <label className="grid gap-1 text-sm text-[var(--flux-text)]">
                Título da demanda
                <input
                  required
                  minLength={3}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="rounded-[var(--flux-rad-sm)] border border-[var(--flux-chrome-alpha-16)] bg-[var(--flux-surface-elevated)] px-3 py-2 text-[var(--flux-text)] outline-none focus:border-[var(--flux-primary)]"
                />
              </label>
              <label className="grid gap-1 text-sm text-[var(--flux-text)]">
                Descrição
                <textarea
                  required
                  minLength={5}
                  rows={6}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="rounded-[var(--flux-rad-sm)] border border-[var(--flux-chrome-alpha-16)] bg-[var(--flux-surface-elevated)] px-3 py-2 text-[var(--flux-text)] outline-none focus:border-[var(--flux-primary)]"
                />
              </label>
              <label className="grid gap-1 text-sm text-[var(--flux-text)]">
                Tags (separadas por vírgula, opcional)
                <input
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  placeholder="Comercial, Tomador"
                  className="rounded-[var(--flux-rad-sm)] border border-[var(--flux-chrome-alpha-16)] bg-[var(--flux-surface-elevated)] px-3 py-2 text-[var(--flux-text)] outline-none focus:border-[var(--flux-primary)]"
                />
              </label>
              <button type="submit" disabled={submitting} className="btn-primary mt-1 disabled:opacity-60">
                {submitting ? "Enviando..." : "Enviar demanda"}
              </button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
