"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { AiModelHint } from "@/components/ai-model-hint";

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

  const [similarMatches, setSimilarMatches] = useState<
    Array<{ cardId: string; title: string; bucketLabel: string; score: number }>
  >([]);
  const [similarLoading, setSimilarLoading] = useState(false);
  const similarDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const similarSeqRef = useRef(0);

  const [lastSubmit, setLastSubmit] = useState<"merged" | "created" | null>(null);
  const [lastCardId, setLastCardId] = useState<string | null>(null);
  const [lastClassificationLlm, setLastClassificationLlm] = useState<{ model?: string; provider?: string } | null>(null);
  const [lastClassificationRationale, setLastClassificationRationale] = useState<string | null>(null);

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

  useEffect(() => {
    if (!slug || !form) return;
    const q = title.trim();
    if (q.length < 3) {
      setSimilarMatches([]);
      setSimilarLoading(false);
      return;
    }
    if (similarDebounceRef.current != null) clearTimeout(similarDebounceRef.current);
    similarDebounceRef.current = setTimeout(() => {
      const seq = ++similarSeqRef.current;
      setSimilarLoading(true);
      void (async () => {
        try {
          const r = await fetch(`/api/forms/${encodeURIComponent(slug)}/similar-cards`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title: q, description: description.trim() }),
          });
          const data = (await r.json().catch(() => ({}))) as {
            matches?: Array<{ cardId: string; title: string; bucketLabel: string; score: number }>;
          };
          if (similarSeqRef.current !== seq) return;
          const raw = Array.isArray(data.matches) ? data.matches : [];
          setSimilarMatches(
            raw.slice(0, 3).map((m) => ({
              cardId: m.cardId,
              title: m.title,
              bucketLabel: m.bucketLabel,
              score: m.score,
            }))
          );
        } catch {
          if (similarSeqRef.current !== seq) return;
          setSimilarMatches([]);
        } finally {
          if (similarSeqRef.current === seq) setSimilarLoading(false);
        }
      })();
    }, 500);
    return () => {
      if (similarDebounceRef.current != null) clearTimeout(similarDebounceRef.current);
    };
  }, [slug, form, title, description]);

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
      setLastSubmit(data.merged ? "merged" : "created");
      setLastCardId(typeof data.cardId === "string" ? data.cardId : null);
      const cls = data.classification as { llmModel?: string; llmProvider?: string; usedLlm?: boolean; rationale?: string } | undefined;
      setLastClassificationRationale(typeof cls?.rationale === "string" && cls.rationale.trim() ? cls.rationale.trim() : null);
      if (cls?.usedLlm && (cls.llmModel || cls.llmProvider)) {
        setLastClassificationLlm({ model: cls.llmModel, provider: cls.llmProvider });
      } else {
        setLastClassificationLlm(null);
      }
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
    <main className="min-h-[100dvh] overflow-x-hidden bg-[var(--flux-surface-dark)] px-[max(1rem,env(safe-area-inset-left,0px))] py-10 pr-[max(1rem,env(safe-area-inset-right,0px))] pb-[max(2.5rem,env(safe-area-inset-bottom,0px))] pt-[max(2.5rem,env(safe-area-inset-top,0px))]">
      <div className="mx-auto max-w-[760px] rounded-[var(--flux-rad)] border border-[var(--flux-primary-alpha-24)] bg-[var(--flux-surface-card)] p-5 sm:p-6 md:p-8">
        {loading && <p className="text-[var(--flux-text-muted)]">Carregando formulário...</p>}
        {!loading && error && <p className="text-[var(--flux-danger)]">{error}</p>}
        {!loading && !error && form && (
          <>
            <h1 className="font-display text-2xl font-bold text-[var(--flux-text)]">{form.title}</h1>
            {form.description && <p className="mt-2 text-sm text-[var(--flux-text-muted)]">{form.description}</p>}
            {done && (
              <div
                className={`mt-4 rounded-[var(--flux-rad)] border px-4 py-3 text-sm leading-relaxed ${
                  lastSubmit === "merged"
                    ? "border-[var(--flux-warning-alpha-45)] bg-[var(--flux-warning-alpha-14)] text-[var(--flux-text)]"
                    : "border-[var(--flux-success-alpha-40)] bg-[var(--flux-success-alpha-12)] text-[var(--flux-text)]"
                }`}
                role="status"
              >
                {lastSubmit === "merged" ? (
                  <>
                    <p className="font-display text-base font-bold text-[var(--flux-text)]">
                      Possível duplicata — atualizamos um card existente
                    </p>
                    <p className="mt-1.5 text-[var(--flux-text-muted)]">
                      A IA identificou forte similaridade com um card já no quadro. Seu texto foi anexado a esse card em
                      vez de criar outro. Isso evita poluir métricas com itens repetidos.
                    </p>
                    {lastCardId ? (
                      <p className="mt-2 font-mono text-xs text-[var(--flux-text-muted)]">Card: {lastCardId}</p>
                    ) : null}
                    {lastClassificationLlm ? (
                      <div className="mt-2">
                        <AiModelHint model={lastClassificationLlm.model} provider={lastClassificationLlm.provider} />
                      </div>
                    ) : null}
                    {lastClassificationRationale ? (
                      <div className="mt-2 rounded-[var(--flux-rad-sm)] border border-[var(--flux-warning-alpha-35)] bg-[var(--flux-warning-alpha-10)] px-3 py-2 text-xs text-[var(--flux-text-muted)]">
                        Classificação aplicada: {lastClassificationRationale}
                      </div>
                    ) : null}
                  </>
                ) : (
                  <p>Demanda enviada com sucesso. Seu card já foi criado no board.</p>
                )}
                {lastSubmit === "created" && lastClassificationLlm ? (
                  <div className="mt-2">
                    <AiModelHint model={lastClassificationLlm.model} provider={lastClassificationLlm.provider} />
                  </div>
                ) : null}
                {lastSubmit === "created" && lastClassificationRationale ? (
                  <div className="mt-2 rounded-[var(--flux-rad-sm)] border border-[var(--flux-success-alpha-35)] bg-[var(--flux-success-alpha-12)] px-3 py-2 text-xs text-[var(--flux-text-muted)]">
                    Classificação aplicada: {lastClassificationRationale}
                  </div>
                ) : null}
              </div>
            )}
            <form onSubmit={onSubmit} className="mt-6 grid gap-4">
              <label className="grid gap-1 text-sm text-[var(--flux-text)]">
                Nome
                <input
                  required
                  value={requesterName}
                  onChange={(e) => setRequesterName(e.target.value)}
                  className="min-h-11 rounded-[var(--flux-rad-sm)] border border-[var(--flux-chrome-alpha-16)] bg-[var(--flux-surface-elevated)] px-3 py-2 text-[var(--flux-text)] outline-none focus:border-[var(--flux-primary)]"
                />
              </label>
              <label className="grid gap-1 text-sm text-[var(--flux-text)]">
                E-mail (opcional)
                <input
                  type="email"
                  value={requesterEmail}
                  onChange={(e) => setRequesterEmail(e.target.value)}
                  className="min-h-11 rounded-[var(--flux-rad-sm)] border border-[var(--flux-chrome-alpha-16)] bg-[var(--flux-surface-elevated)] px-3 py-2 text-[var(--flux-text)] outline-none focus:border-[var(--flux-primary)]"
                />
              </label>
              <label className="grid gap-1 text-sm text-[var(--flux-text)]">
                Título da demanda
                <input
                  required
                  minLength={3}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="min-h-11 rounded-[var(--flux-rad-sm)] border border-[var(--flux-chrome-alpha-16)] bg-[var(--flux-surface-elevated)] px-3 py-2 text-[var(--flux-text)] outline-none focus:border-[var(--flux-primary)]"
                />
                {(similarLoading || similarMatches.length > 0) && (
                  <div
                    className="mt-2 rounded-[var(--flux-rad-sm)] border border-[var(--flux-info-alpha-35)] bg-[var(--flux-info-alpha-10)] px-3 py-2 text-sm"
                    role="status"
                    aria-live="polite"
                  >
                    <p className="text-xs font-semibold uppercase tracking-wide text-[var(--flux-text-muted)]">
                      Antes de enviar — cards similares no quadro
                    </p>
                    {similarLoading ? (
                      <p className="mt-1 text-xs text-[var(--flux-text-muted)]">Verificando…</p>
                    ) : (
                      <ul className="mt-2 space-y-1.5">
                        {similarMatches.map((m) => (
                          <li key={m.cardId} className="text-xs text-[var(--flux-text)]">
                            <span className="font-medium">{m.title}</span>
                            <span className="text-[var(--flux-text-muted)]">
                              {" "}
                              · {m.bucketLabel} · {(m.score * 100).toFixed(0)}% similar
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                    <p className="mt-2 text-[11px] leading-snug text-[var(--flux-text-muted)]">
                      Se for a mesma demanda, o envio pode atualizar o card existente (detecção automática ao enviar).
                    </p>
                  </div>
                )}
              </label>
              <label className="grid gap-1 text-sm text-[var(--flux-text)]">
                Descrição
                <textarea
                  required
                  minLength={5}
                  rows={6}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="min-h-[8rem] rounded-[var(--flux-rad-sm)] border border-[var(--flux-chrome-alpha-16)] bg-[var(--flux-surface-elevated)] px-3 py-2 text-[var(--flux-text)] outline-none focus:border-[var(--flux-primary)]"
                />
              </label>
              <label className="grid gap-1 text-sm text-[var(--flux-text)]">
                Tags (separadas por vírgula, opcional)
                <input
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  placeholder="Comercial, Tomador"
                  className="min-h-11 rounded-[var(--flux-rad-sm)] border border-[var(--flux-chrome-alpha-16)] bg-[var(--flux-surface-elevated)] px-3 py-2 text-[var(--flux-text)] outline-none focus:border-[var(--flux-primary)]"
                />
              </label>
              <button type="submit" disabled={submitting} className="btn-primary mt-1 min-h-11 w-full sm:w-auto disabled:opacity-60">
                {submitting ? "Enviando..." : "Enviar demanda"}
              </button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
