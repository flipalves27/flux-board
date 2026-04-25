"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { FluxAppBackdrop } from "@/components/ui/flux-app-backdrop";
import { FluxBrandMark } from "@/components/ui/flux-brand-mark";

type FormField = {
  id: string;
  label: string;
  type: "textarea";
  maxLength: number;
  placeholder: string | null;
};

type FormBlock = { id: string; title: string; fields: FormField[] };

export default function PublicDiscoverySessionPage() {
  const params = useParams();
  const locale = Array.isArray(params.locale) ? params.locale[0] : (params.locale as string);
  const tokenRaw = Array.isArray(params.token) ? params.token[0] : (params.token as string);
  const token = decodeURIComponent(String(tokenRaw || "").trim());

  const t = useTranslations("discoveryPublic");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [boardTitle, setBoardTitle] = useState("");
  const [blocks, setBlocks] = useState<FormBlock[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (!token || token.length < 16) {
      setError(t("invalidToken"));
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/public/discovery/${encodeURIComponent(token)}`, { cache: "no-store" });
      const j = (await res.json().catch(() => ({}))) as {
        error?: string;
        status?: string;
        boardTitle?: string;
        form?: { blocks?: FormBlock[] };
      };
      if (!res.ok) {
        setError(j.error || t("loadError"));
        setLoading(false);
        return;
      }
      setStatus(j.status ?? null);
      setBoardTitle(String(j.boardTitle || ""));
      const bl = Array.isArray(j.form?.blocks) ? j.form!.blocks! : [];
      setBlocks(bl);
      const init: Record<string, string> = {};
      for (const b of bl) {
        for (const f of b.fields) init[f.id] = "";
      }
      setValues(init);
    } catch {
      setError(t("loadError"));
    } finally {
      setLoading(false);
    }
  }, [token, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting || status !== "open") return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/public/discovery/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ responses: values }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string; ok?: boolean };
      if (!res.ok) {
        setError(j.error || t("submitError"));
        return;
      }
      setSubmitted(true);
      setStatus("submitted");
    } catch {
      setError(t("submitError"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative isolate min-h-[100dvh] min-w-0 overflow-x-hidden">
      <FluxAppBackdrop />
      <div className="relative z-[1] max-w-xl mx-auto px-4 py-10">
        <div className="flex items-center gap-2 mb-8">
          <FluxBrandMark platformName="Flux" className="h-8 w-auto" />
        </div>

        <h1 className="text-xl font-semibold text-[var(--flux-text)] mb-1">{t("pageTitle")}</h1>
        {boardTitle ? <p className="text-sm text-[var(--flux-text-muted)] mb-6">{boardTitle}</p> : null}

        {loading ? <p className="text-sm text-[var(--flux-text-muted)]">{t("loading")}</p> : null}

        {error ? (
          <div className="rounded-[var(--flux-rad)] border border-[var(--flux-danger)]/40 bg-[var(--flux-danger)]/10 px-3 py-2 text-sm text-[var(--flux-danger)] mb-4">
            {error}
          </div>
        ) : null}

        {!loading && status === "submitted" && !submitted ? (
          <p className="text-sm text-[var(--flux-text-muted)]">{t("alreadySubmitted")}</p>
        ) : null}

        {!loading && status === "processed" ? (
          <p className="text-sm text-[var(--flux-text-muted)]">{t("closed")}</p>
        ) : null}

        {!loading && submitted ? (
          <p className="text-sm text-[var(--flux-success)] font-medium">{t("thankYou")}</p>
        ) : null}

        {!loading && status === "open" && !submitted ? (
          <form onSubmit={onSubmit} className="space-y-6">
            <p className="text-xs text-[var(--flux-text-muted)] leading-relaxed">{t("privacyNote")}</p>
            {blocks.map((block) => (
              <fieldset key={block.id} className="space-y-3 border-0 p-0 m-0">
                <legend className="text-sm font-semibold text-[var(--flux-text)] mb-2">{block.title}</legend>
                {block.fields.map((f) => (
                  <label key={f.id} className="block space-y-1">
                    <span className="text-sm text-[var(--flux-text)]">{f.label}</span>
                    <textarea
                      className="w-full min-h-[100px] text-sm rounded-[var(--flux-rad)] border border-[var(--flux-border-default)] bg-[var(--flux-surface)] px-3 py-2"
                      maxLength={f.maxLength}
                      placeholder={f.placeholder ?? undefined}
                      value={values[f.id] ?? ""}
                      onChange={(e) => setValues((v) => ({ ...v, [f.id]: e.target.value }))}
                      required={false}
                    />
                    <span className="text-[11px] text-[var(--flux-text-muted)]">
                      {(values[f.id] ?? "").length}/{f.maxLength}
                    </span>
                  </label>
                ))}
              </fieldset>
            ))}
            <button type="submit" className="btn-primary w-full sm:w-auto text-sm" disabled={submitting}>
              {submitting ? t("submitting") : t("submit")}
            </button>
          </form>
        ) : null}

        <p className="text-[11px] text-[var(--flux-text-muted)] mt-10">{t("footer", { locale })}</p>
      </div>
    </div>
  );
}
