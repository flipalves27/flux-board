"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { useAuth } from "@/context/auth-context";
import { apiDelete, apiGet, apiPost, apiPut, ApiError } from "@/lib/api-client";
import { useToast } from "@/context/toast-context";
import { WEBHOOK_EVENT_TYPES } from "@/lib/webhook-types";

type WebhookRow = {
  _id: string;
  url: string;
  secretHint: string;
  events: string[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

type DeliveryRow = {
  id: string;
  subscriptionId: string;
  eventId: string;
  eventType: string;
  payload: Record<string, unknown>;
  status: string;
  attempts: number;
  httpStatus: number | null;
  responseBody: string | null;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string;
};

export function OrgWebhooksSettings() {
  const { getHeaders } = useAuth();
  const { pushToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [webhooks, setWebhooks] = useState<WebhookRow[]>([]);
  const [deliveries, setDeliveries] = useState<DeliveryRow[]>([]);
  const [busy, setBusy] = useState(false);

  const [newUrl, setNewUrl] = useState("");
  const [newEvents, setNewEvents] = useState<Set<string>>(
    () => new Set(["card.completed", "form.submitted"])
  );
  const [newSecret, setNewSecret] = useState("");

  const [editId, setEditId] = useState<string | null>(null);
  const [editUrl, setEditUrl] = useState("");
  const [editEvents, setEditEvents] = useState<Set<string>>(new Set());
  const [editActive, setEditActive] = useState(true);
  const [editSecret, setEditSecret] = useState("");
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [w, d] = await Promise.all([
        apiGet<{ webhooks: WebhookRow[] }>("/api/org/webhooks", getHeaders()),
        apiGet<{ deliveries: DeliveryRow[] }>("/api/org/webhook-deliveries?limit=100", getHeaders()),
      ]);
      setWebhooks(w.webhooks ?? []);
      setDeliveries(d.deliveries ?? []);
    } catch (e) {
      pushToast({
        kind: "error",
        title: e instanceof ApiError ? e.message : "Erro ao carregar webhooks.",
      });
    } finally {
      setLoading(false);
    }
  }, [getHeaders, pushToast]);

  useEffect(() => {
    void load();
  }, [load]);

  function toggleEventSet(prev: Set<string>, ev: string): Set<string> {
    const n = new Set(prev);
    if (n.has(ev)) n.delete(ev);
    else n.add(ev);
    return n;
  }

  async function createWebhook() {
    const url = newUrl.trim();
    if (!url) {
      pushToast({ kind: "error", title: "Informe a URL do endpoint." });
      return;
    }
    if (newEvents.size === 0) {
      pushToast({ kind: "error", title: "Selecione ao menos um tipo de evento." });
      return;
    }
    setBusy(true);
    try {
      const res = await apiPost<{ webhook: WebhookRow; secret?: string }>(
        "/api/org/webhooks",
        {
          url,
          events: [...newEvents],
          active: true,
          ...(newSecret.trim().length >= 8 ? { secret: newSecret.trim() } : {}),
        },
        getHeaders()
      );
      setWebhooks((prev) => [res.webhook, ...prev]);
      setNewUrl("");
      setNewSecret("");
      if (res.secret) {
        pushToast({
          kind: "success",
          title: "Webhook criado. Copie o secret agora — ele não será exibido novamente.",
        });
        void navigator.clipboard?.writeText(res.secret);
      } else {
        pushToast({ kind: "success", title: "Webhook criado." });
      }
      await load();
    } catch (e) {
      pushToast({
        kind: "error",
        title: e instanceof ApiError ? e.message : "Falha ao criar webhook.",
      });
    } finally {
      setBusy(false);
    }
  }

  function startEdit(w: WebhookRow) {
    setEditId(w._id);
    setEditUrl(w.url);
    setEditActive(w.active);
    setEditEvents(new Set(w.events));
    setEditSecret("");
  }

  async function saveEdit() {
    if (!editId) return;
    setBusy(true);
    try {
      const body: Record<string, unknown> = {
        url: editUrl.trim(),
        events: [...editEvents],
        active: editActive,
      };
      if (editSecret.trim().length >= 8) body.secret = editSecret.trim();
      const res = await apiPut<{ webhook: WebhookRow; secret?: string }>(
        `/api/org/webhooks/${encodeURIComponent(editId)}`,
        body,
        getHeaders()
      );
      setWebhooks((prev) => prev.map((x) => (x._id === editId ? res.webhook : x)));
      setEditId(null);
      if (res.secret) {
        pushToast({ kind: "success", title: "Secret atualizado (copiado para a área de transferência)." });
        void navigator.clipboard?.writeText(res.secret);
      } else {
        pushToast({ kind: "success", title: "Webhook atualizado." });
      }
      await load();
    } catch (e) {
      pushToast({
        kind: "error",
        title: e instanceof ApiError ? e.message : "Falha ao salvar.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Excluir esta subscription de webhook?")) return;
    setBusy(true);
    try {
      await apiDelete(`/api/org/webhooks/${encodeURIComponent(id)}`, getHeaders());
      setWebhooks((prev) => prev.filter((w) => w._id !== id));
      pushToast({ kind: "success", title: "Webhook removido." });
    } catch (e) {
      pushToast({
        kind: "error",
        title: e instanceof ApiError ? e.message : "Falha ao excluir.",
      });
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-[var(--flux-text-muted)]">Carregando webhooks…</p>;
  }

  return (
    <div className="space-y-8 mt-10 pt-10 border-t border-[var(--flux-primary-alpha-15)]">
      <div>
        <h3 className="font-display font-bold text-lg text-[var(--flux-text)] mb-1">Webhooks (Zapier-ready)</h3>
        <p className="text-sm text-[var(--flux-text-muted)] mb-4">
          Envie eventos para URLs externas com corpo JSON assinado (HMAC-SHA256). Retentativas: 10s, 60s e 300s após
          falhas. O reenvio em produção depende de agendamento no servidor; o administrador da plataforma configura-o no
          ambiente de deploy (não partilhe segredos de cron em texto copiável).
        </p>

        <div className="rounded-[var(--flux-rad)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)]/40 p-4 space-y-3">
          <p className="text-xs font-semibold text-[var(--flux-text-muted)]">Nova subscription</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              placeholder="https://hooks.zapier.com/…"
              className="w-full px-3 py-2 border border-[var(--flux-chrome-alpha-12)] rounded-[var(--flux-rad)] text-sm bg-[var(--flux-surface-elevated)] font-mono"
              disabled={busy}
            />
            <input
              value={newSecret}
              onChange={(e) => setNewSecret(e.target.value)}
              placeholder="Secret opcional (mín. 8) — ou gere automático"
              className="w-full px-3 py-2 border border-[var(--flux-chrome-alpha-12)] rounded-[var(--flux-rad)] text-sm bg-[var(--flux-surface-elevated)] font-mono"
              disabled={busy}
              autoComplete="off"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {WEBHOOK_EVENT_TYPES.map((ev) => (
              <label key={ev} className="flex items-center gap-1.5 text-xs text-[var(--flux-text)] cursor-pointer">
                <input
                  type="checkbox"
                  checked={newEvents.has(ev)}
                  onChange={() => setNewEvents((prev) => toggleEventSet(prev, ev))}
                  disabled={busy}
                />
                <span className="font-mono">{ev}</span>
              </label>
            ))}
          </div>
          <button type="button" className="btn-primary text-xs py-1.5 px-3" disabled={busy} onClick={() => void createWebhook()}>
            Adicionar webhook
          </button>
        </div>
      </div>

      <div className="space-y-3">
        <h4 className="font-display font-semibold text-[var(--flux-text)]">Subscriptions</h4>
        {webhooks.length === 0 ? (
          <p className="text-sm text-[var(--flux-text-muted)]">Nenhum webhook configurado.</p>
        ) : (
          <ul className="space-y-2">
            {webhooks.map((w) => (
              <li
                key={w._id}
                className="rounded-[var(--flux-rad)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-card)] p-3 text-sm"
              >
                {editId === w._id ? (
                  <div className="space-y-2">
                    <input
                      value={editUrl}
                      onChange={(e) => setEditUrl(e.target.value)}
                      className="w-full px-2 py-1.5 border rounded font-mono text-xs bg-[var(--flux-surface-elevated)]"
                      disabled={busy}
                    />
                    <label className="flex items-center gap-2 text-xs">
                      <input type="checkbox" checked={editActive} onChange={(e) => setEditActive(e.target.checked)} />
                      Ativo
                    </label>
                    <input
                      value={editSecret}
                      onChange={(e) => setEditSecret(e.target.value)}
                      placeholder="Novo secret (opcional, mín. 8)"
                      className="w-full px-2 py-1.5 border rounded font-mono text-xs bg-[var(--flux-surface-elevated)]"
                      disabled={busy}
                      autoComplete="off"
                    />
                    <div className="flex flex-wrap gap-1.5">
                      {WEBHOOK_EVENT_TYPES.map((ev) => (
                        <label key={ev} className="flex items-center gap-1 text-[10px] font-mono cursor-pointer">
                          <input
                            type="checkbox"
                            checked={editEvents.has(ev)}
                            onChange={() => setEditEvents((prev) => toggleEventSet(prev, ev))}
                            disabled={busy}
                          />
                          {ev}
                        </label>
                      ))}
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button type="button" className="btn-primary text-xs py-1 px-2" disabled={busy} onClick={() => void saveEdit()}>
                        Salvar
                      </button>
                      <button type="button" className="btn-secondary text-xs py-1 px-2" disabled={busy} onClick={() => setEditId(null)}>
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-mono text-xs break-all text-[var(--flux-secondary)]">{w.url}</div>
                      <div className="text-[10px] text-[var(--flux-text-muted)] mt-1">
                        Secret {w.secretHint} · {w.active ? "ativo" : "inativo"}
                      </div>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {w.events.map((ev) => (
                          <span key={ev} className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--flux-surface-dark)] font-mono">
                            {ev}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button type="button" className="btn-secondary text-xs py-1 px-2" disabled={busy} onClick={() => startEdit(w)}>
                        Editar
                      </button>
                      <button type="button" className="text-xs text-[var(--flux-danger)] py-1 px-2" disabled={busy} onClick={() => void remove(w._id)}>
                        Excluir
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between gap-2 mb-2">
          <h4 className="font-display font-semibold text-[var(--flux-text)]">Últimas entregas</h4>
          <button type="button" className="text-xs text-[var(--flux-secondary)] underline" onClick={() => void load()}>
            Atualizar
          </button>
        </div>
        <div className="overflow-x-auto rounded-[var(--flux-rad)] border border-[var(--flux-chrome-alpha-12)] max-h-[420px] overflow-y-auto">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-[var(--flux-surface-card)] border-b border-[var(--flux-chrome-alpha-12)]">
              <tr>
                <th className="p-2 font-display w-8" />
                <th className="p-2 font-display">Quando</th>
                <th className="p-2 font-display">Evento</th>
                <th className="p-2 font-display">Status</th>
                <th className="p-2 font-display">HTTP</th>
                <th className="p-2 font-display">Tentativas</th>
              </tr>
            </thead>
            <tbody>
              {deliveries.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-3 text-[var(--flux-text-muted)]">
                    Nenhuma entrega registrada ainda.
                  </td>
                </tr>
              ) : (
                deliveries.map((d) => (
                  <Fragment key={d.id}>
                    <tr className="border-b border-[var(--flux-chrome-alpha-12)] align-top">
                      <td className="p-2">
                        <button
                          type="button"
                          className="text-[var(--flux-secondary)] text-[10px] underline"
                          onClick={() => setExpandedLogId((x) => (x === d.id ? null : d.id))}
                        >
                          {expandedLogId === d.id ? "−" : "+"}
                        </button>
                      </td>
                      <td className="p-2 whitespace-nowrap text-[var(--flux-text-muted)]">
                        {new Date(d.completedAt).toLocaleString()}
                      </td>
                      <td className="p-2 font-mono">{d.eventType}</td>
                      <td className="p-2">{d.status}</td>
                      <td className="p-2">{d.httpStatus ?? "—"}</td>
                      <td className="p-2">{d.attempts}</td>
                    </tr>
                    {expandedLogId === d.id ? (
                      <tr className="border-b border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)]/30">
                        <td colSpan={6} className="p-3 text-[11px]">
                          {d.errorMessage ? (
                            <p className="text-[var(--flux-danger)] mb-2">
                              <strong>Erro:</strong> {d.errorMessage}
                            </p>
                          ) : null}
                          <p className="font-semibold text-[var(--flux-text-muted)] mb-1">Payload enviado</p>
                          <pre className="font-mono text-[10px] whitespace-pre-wrap break-all max-h-40 overflow-auto mb-3 p-2 rounded bg-[var(--flux-surface-dark)]">
                            {JSON.stringify(d.payload, null, 2)}
                          </pre>
                          <p className="font-semibold text-[var(--flux-text-muted)] mb-1">Resposta (corpo)</p>
                          <pre className="font-mono text-[10px] whitespace-pre-wrap break-all max-h-40 overflow-auto p-2 rounded bg-[var(--flux-surface-dark)]">
                            {d.responseBody || "—"}
                          </pre>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
        <p className="text-[10px] text-[var(--flux-text-muted)] mt-2">
          Payload e resposta completos ficam no objeto de log (via API). Documentação Zapier:{" "}
          <code className="font-mono">docs/zapier-webhook-schema.md</code>
        </p>
      </div>
    </div>
  );
}
