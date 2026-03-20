"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch, getApiHeaders } from "@/lib/api-client";
import { useModalA11y } from "@/components/ui/use-modal-a11y";
import { useToast } from "@/context/toast-context";
import type { AutomationAction, AutomationRule, AutomationTrigger } from "@/lib/automation-types";

function newRuleId(): string {
  return `r_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

function defaultTrigger(bucketKeys: string[]): AutomationTrigger {
  const k = bucketKeys[0] || "Backlog";
  return { type: "card_moved_to_column", columnKey: k };
}

function defaultAction(): AutomationAction {
  return { type: "set_priority", priority: "Média" };
}

type Props = {
  open: boolean;
  onClose: () => void;
  boardId: string;
  bucketKeys: string[];
  priorities: string[];
  progresses: string[];
  getHeaders: () => Record<string, string>;
};

export function BoardAutomationsModal({
  open,
  onClose,
  boardId,
  bucketKeys,
  priorities,
  progresses,
  getHeaders,
}: Props) {
  const t = useTranslations("board.automations");
  const { pushToast } = useToast();
  const containerRef = useRef<HTMLDivElement>(null);
  useModalA11y({ open, onClose, containerRef });

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rules, setRules] = useState<AutomationRule[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/boards/${encodeURIComponent(boardId)}/automations`, {
        headers: getApiHeaders(getHeaders()),
      });
      const data = (await res.json()) as { rules?: AutomationRule[]; error?: string };
      if (!res.ok) throw new Error(data.error || "load");
      setRules(Array.isArray(data.rules) ? data.rules : []);
    } catch {
      pushToast({ kind: "error", title: t("loadError") });
      setRules([]);
    } finally {
      setLoading(false);
    }
  }, [boardId, getHeaders, pushToast, t]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const save = async () => {
    setSaving(true);
    try {
      const res = await apiFetch(`/api/boards/${encodeURIComponent(boardId)}/automations`, {
        method: "PUT",
        headers: getApiHeaders(getHeaders()),
        body: JSON.stringify({ rules }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "save");
      pushToast({ kind: "success", title: t("saveSuccess") });
      onClose();
    } catch {
      pushToast({ kind: "error", title: t("saveError") });
    } finally {
      setSaving(false);
    }
  };

  const updateRule = (index: number, patch: Partial<AutomationRule>) => {
    setRules((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  };

  const setTriggerType = (index: number, type: AutomationTrigger["type"]) => {
    const bk = bucketKeys[0] || "Backlog";
    let trigger: AutomationTrigger;
    switch (type) {
      case "card_moved_to_column":
        trigger = { type, columnKey: bk };
        break;
      case "card_created_with_tag":
        trigger = { type, tag: "incidente" };
        break;
      case "card_stuck_in_column":
        trigger = { type, columnKey: bk, days: 3 };
        break;
      case "due_date_within_days":
        trigger = { type, days: 3 };
        break;
      case "form_submission":
        trigger = { type: "form_submission" };
        break;
      case "board_completion_percent":
        trigger = { type, percent: 80 };
        break;
      default:
        trigger = defaultTrigger(bucketKeys);
    }
    updateRule(index, { trigger });
  };

  const setActionType = (index: number, type: AutomationAction["type"]) => {
    let action: AutomationAction;
    switch (type) {
      case "set_priority":
        action = { type, priority: priorities[0] || "Média" };
        break;
      case "set_progress":
        action = { type, progress: progresses[0] || "Não iniciado" };
        break;
      case "set_priority_and_notify_owner":
        action = { type, priority: "Urgente" };
        break;
      case "notify_owner_add_tag":
        action = { type, tag: "atrasado" };
        break;
      case "send_due_reminder_email":
      case "classify_card_with_ai":
      case "generate_executive_brief_email":
        action = { type };
        break;
      default:
        action = defaultAction();
    }
    updateRule(index, { action });
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/55 backdrop-blur-[2px]"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="automations-title"
        className="w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col rounded-2xl border border-[rgba(108,92,231,0.35)] bg-[var(--flux-surface-card)] shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-[rgba(255,255,255,0.08)]">
          <h2 id="automations-title" className="text-lg font-semibold text-[var(--flux-text)] font-display">
            {t("title")}
          </h2>
          <button type="button" className="btn-secondary text-sm" onClick={onClose}>
            {t("close")}
          </button>
        </div>

        <div className="px-5 py-4 overflow-y-auto flex-1 space-y-4">
          <p className="text-sm text-[var(--flux-text-muted)]">{t("hint")}</p>

          {loading ? (
            <p className="text-sm text-[var(--flux-text-muted)]">{t("loading")}</p>
          ) : (
            <div className="space-y-4">
              {rules.map((rule, idx) => (
                <div
                  key={rule.id}
                  className="rounded-xl border border-[rgba(255,255,255,0.08)] p-4 space-y-3 bg-[var(--flux-surface-elevated)]/40"
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="flex items-center gap-2 text-xs text-[var(--flux-text-muted)]">
                      <input
                        type="checkbox"
                        checked={rule.enabled !== false}
                        onChange={(e) => updateRule(idx, { enabled: e.target.checked })}
                      />
                      {t("enabled")}
                    </label>
                    <input
                      type="text"
                      className="flex-1 min-w-[120px] rounded-lg bg-[var(--flux-surface-dark)] border border-[rgba(255,255,255,0.1)] px-2 py-1 text-sm"
                      placeholder={t("namePlaceholder")}
                      value={rule.name || ""}
                      onChange={(e) => updateRule(idx, { name: e.target.value })}
                    />
                    <button
                      type="button"
                      className="text-xs text-[var(--flux-danger)] hover:underline"
                      onClick={() => setRules((r) => r.filter((_, i) => i !== idx))}
                    >
                      {t("remove")}
                    </button>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-[var(--flux-text-muted)]">{t("trigger")}</label>
                      <select
                        className="w-full rounded-lg bg-[var(--flux-surface-dark)] border border-[rgba(255,255,255,0.1)] px-2 py-2 text-sm"
                        value={rule.trigger.type}
                        onChange={(e) => setTriggerType(idx, e.target.value as AutomationTrigger["type"])}
                      >
                        <option value="card_moved_to_column">{t("triggers.card_moved_to_column")}</option>
                        <option value="card_created_with_tag">{t("triggers.card_created_with_tag")}</option>
                        <option value="card_stuck_in_column">{t("triggers.card_stuck_in_column")}</option>
                        <option value="due_date_within_days">{t("triggers.due_date_within_days")}</option>
                        <option value="form_submission">{t("triggers.form_submission")}</option>
                        <option value="board_completion_percent">{t("triggers.board_completion_percent")}</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-[var(--flux-text-muted)]">{t("action")}</label>
                      <select
                        className="w-full rounded-lg bg-[var(--flux-surface-dark)] border border-[rgba(255,255,255,0.1)] px-2 py-2 text-sm"
                        value={rule.action.type}
                        onChange={(e) => setActionType(idx, e.target.value as AutomationAction["type"])}
                      >
                        <option value="set_priority">{t("actions.set_priority")}</option>
                        <option value="set_progress">{t("actions.set_progress")}</option>
                        <option value="set_priority_and_notify_owner">{t("actions.set_priority_and_notify_owner")}</option>
                        <option value="notify_owner_add_tag">{t("actions.notify_owner_add_tag")}</option>
                        <option value="send_due_reminder_email">{t("actions.send_due_reminder_email")}</option>
                        <option value="classify_card_with_ai">{t("actions.classify_card_with_ai")}</option>
                        <option value="generate_executive_brief_email">{t("actions.generate_executive_brief_email")}</option>
                      </select>
                    </div>
                  </div>

                  <TriggerFields
                    trigger={rule.trigger}
                    bucketKeys={bucketKeys}
                    onChange={(tr) => updateRule(idx, { trigger: tr })}
                  />
                  <ActionFields
                    action={rule.action}
                    priorities={priorities}
                    progresses={progresses}
                    onChange={(ac) => updateRule(idx, { action: ac })}
                  />
                </div>
              ))}

              <button
                type="button"
                className="btn-secondary text-sm w-full sm:w-auto"
                onClick={() =>
                  setRules((r) => [
                    ...r,
                    {
                      id: newRuleId(),
                      enabled: true,
                      name: "",
                      trigger: defaultTrigger(bucketKeys),
                      action: defaultAction(),
                    },
                  ])
                }
              >
                {t("addRule")}
              </button>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-[rgba(255,255,255,0.08)]">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>
            {t("close")}
          </button>
          <button type="button" className="btn-primary" onClick={() => void save()} disabled={saving || loading}>
            {saving ? t("saving") : t("save")}
          </button>
        </div>
      </div>
    </div>
  );
}

function TriggerFields({
  trigger,
  bucketKeys,
  onChange,
}: {
  trigger: AutomationTrigger;
  bucketKeys: string[];
  onChange: (t: AutomationTrigger) => void;
}) {
  if (trigger.type === "card_moved_to_column" || trigger.type === "card_stuck_in_column") {
    return (
      <div className="flex flex-wrap gap-3 items-end">
        <label className="text-xs text-[var(--flux-text-muted)] flex flex-col gap-1">
          Coluna
          <select
            className="rounded-lg bg-[var(--flux-surface-dark)] border border-[rgba(255,255,255,0.1)] px-2 py-1.5 text-sm min-w-[180px]"
            value={trigger.columnKey}
            onChange={(e) => onChange({ ...trigger, columnKey: e.target.value })}
          >
            {bucketKeys.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </label>
        {trigger.type === "card_stuck_in_column" && (
          <label className="text-xs text-[var(--flux-text-muted)] flex flex-col gap-1">
            Dias
            <input
              type="number"
              min={1}
              max={365}
              className="w-24 rounded-lg bg-[var(--flux-surface-dark)] border border-[rgba(255,255,255,0.1)] px-2 py-1.5 text-sm"
              value={trigger.days}
              onChange={(e) => onChange({ ...trigger, days: Number(e.target.value) || 1 })}
            />
          </label>
        )}
      </div>
    );
  }
  if (trigger.type === "card_created_with_tag") {
    return (
      <label className="text-xs text-[var(--flux-text-muted)] flex flex-col gap-1 max-w-md">
        Tag
        <input
          type="text"
          className="rounded-lg bg-[var(--flux-surface-dark)] border border-[rgba(255,255,255,0.1)] px-2 py-1.5 text-sm"
          value={trigger.tag}
          onChange={(e) => onChange({ ...trigger, tag: e.target.value })}
        />
      </label>
    );
  }
  if (trigger.type === "due_date_within_days") {
    return (
      <label className="text-xs text-[var(--flux-text-muted)] flex flex-col gap-1">
        Dias até o vencimento (janela)
        <input
          type="number"
          min={0}
          max={90}
          className="w-24 rounded-lg bg-[var(--flux-surface-dark)] border border-[rgba(255,255,255,0.1)] px-2 py-1.5 text-sm"
          value={trigger.days}
          onChange={(e) => onChange({ ...trigger, days: Number(e.target.value) || 0 })}
        />
      </label>
    );
  }
  if (trigger.type === "board_completion_percent") {
    return (
      <label className="text-xs text-[var(--flux-text-muted)] flex flex-col gap-1">
        % concluídos
        <input
          type="number"
          min={1}
          max={100}
          className="w-24 rounded-lg bg-[var(--flux-surface-dark)] border border-[rgba(255,255,255,0.1)] px-2 py-1.5 text-sm"
          value={trigger.percent}
          onChange={(e) => onChange({ ...trigger, percent: Number(e.target.value) || 1 })}
        />
      </label>
    );
  }
  return null;
}

function ActionFields({
  action,
  priorities,
  progresses,
  onChange,
}: {
  action: AutomationAction;
  priorities: string[];
  progresses: string[];
  onChange: (a: AutomationAction) => void;
}) {
  if (action.type === "set_priority" || action.type === "set_priority_and_notify_owner") {
    return (
      <label className="text-xs text-[var(--flux-text-muted)] flex flex-col gap-1 max-w-xs">
        Prioridade
        <select
          className="rounded-lg bg-[var(--flux-surface-dark)] border border-[rgba(255,255,255,0.1)] px-2 py-1.5 text-sm"
          value={action.priority}
          onChange={(e) => onChange({ ...action, priority: e.target.value })}
        >
          {priorities.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </label>
    );
  }
  if (action.type === "set_progress") {
    return (
      <label className="text-xs text-[var(--flux-text-muted)] flex flex-col gap-1 max-w-xs">
        Status / progresso
        <select
          className="rounded-lg bg-[var(--flux-surface-dark)] border border-[rgba(255,255,255,0.1)] px-2 py-1.5 text-sm"
          value={action.progress}
          onChange={(e) => onChange({ ...action, progress: e.target.value })}
        >
          {progresses.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </label>
    );
  }
  if (action.type === "notify_owner_add_tag") {
    return (
      <label className="text-xs text-[var(--flux-text-muted)] flex flex-col gap-1 max-w-xs">
        Tag
        <input
          type="text"
          className="rounded-lg bg-[var(--flux-surface-dark)] border border-[rgba(255,255,255,0.1)] px-2 py-1.5 text-sm"
          value={action.tag}
          onChange={(e) => onChange({ ...action, tag: e.target.value })}
        />
      </label>
    );
  }
  return null;
}
