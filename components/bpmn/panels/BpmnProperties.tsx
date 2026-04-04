"use client";

import { memo, useEffect, useState } from "react";
import { useBpmnStore, type BpmnNodeData, type BpmnEdgeData } from "@/stores/bpmn-store";
import { isTaskLikeType } from "@/lib/bpmn-flow-tokens";
import type { BpmnEdgeKind, BpmnSemanticVariant } from "@/lib/bpmn-types";
import { BpmnLegend } from "@/components/templates/bpmn-legend";

function BpmnPropertiesInner() {
  const {
    nodes,
    edges,
    lanes,
    selectedNodeIds,
    selectedEdgeId,
    propertiesVisible,
    setPropertiesVisible,
    legendExpanded,
    setLegendExpanded,
    updateNodeData,
    updateEdgeData,
    updateLane,
  } = useBpmnStore();

  const selectedNode = nodes.find((n) => selectedNodeIds.includes(n.id)) ?? null;
  const selectedEdge = edges.find((e) => e.id === selectedEdgeId) ?? null;
  const data = selectedNode?.data as BpmnNodeData | null;
  const edgeData = selectedEdge?.data as BpmnEdgeData | null;

  const [label, setLabel] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [tooltip, setTooltip] = useState("");
  const [stepNumber, setStepNumber] = useState("");
  const [painBadge, setPainBadge] = useState("");
  const [laneTag, setLaneTag] = useState("");
  const [edgeLabel, setEdgeLabel] = useState("");

  useEffect(() => {
    if (data) {
      setLabel(data.label);
      setSubtitle(data.subtitle ?? "");
      setTooltip(data.tooltip ?? "");
      setStepNumber(data.stepNumber ?? "");
      setPainBadge(data.painBadge ?? "");
      const lane = lanes.find((l) => l.id === data.laneId);
      setLaneTag(lane?.tag ?? "");
    }
  }, [data, lanes]);

  useEffect(() => {
    setEdgeLabel(edgeData?.label ?? "");
  }, [edgeData]);

  if (!propertiesVisible) {
    return (
      <aside className="flex min-h-0 flex-col items-center gap-2 overflow-hidden rounded-xl border border-[var(--flux-border-default)] bg-[var(--flux-surface-card)] p-2 shadow-[var(--flux-shadow-md)]">
        <button
          type="button"
          title="Mostrar propriedades"
          className="rounded-md border border-[var(--flux-border-default)] bg-[var(--flux-surface-elevated)] px-1.5 py-0.5 text-[11px] font-bold text-[var(--flux-text-muted)] transition hover:border-[var(--flux-primary)]/60 hover:text-[var(--flux-primary-light)]"
          onClick={() => setPropertiesVisible(true)}
        >
          ◀
        </button>
        <span
          className="mt-1 select-none text-[9px] font-extrabold uppercase tracking-widest text-[var(--flux-text-muted)]"
          style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
        >
          Propriedades
        </span>
      </aside>
    );
  }

  const nodeId = selectedNode?.id;

  return (
    <aside className="flex min-h-0 flex-col gap-0 overflow-hidden rounded-xl border border-[var(--flux-border-default)] bg-[var(--flux-surface-card)] shadow-[var(--flux-shadow-md)]">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--flux-border-muted)] p-3">
        <p className="text-[11px] font-extrabold uppercase tracking-wide text-[var(--flux-text)]">Propriedades</p>
        <button
          type="button"
          className="rounded-md border border-[var(--flux-border-default)] bg-[var(--flux-surface-elevated)] px-1.5 py-0.5 text-[11px] font-bold text-[var(--flux-text-muted)] transition hover:border-[var(--flux-primary)]/60 hover:text-[var(--flux-primary-light)]"
          onClick={() => setPropertiesVisible(false)}
        >
          ▶
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {selectedEdge ? (
          <>
            <Field label="ID do fluxo">
              <input value={selectedEdge.id} disabled className="bpmn-prop-input opacity-80" />
            </Field>
            <Field label="Rótulo (ex.: Sim / Não)">
              <input
                value={edgeLabel}
                onChange={(e) => setEdgeLabel(e.target.value)}
                onBlur={() => updateEdgeData(selectedEdge.id, { label: edgeLabel.trim() || undefined })}
                className="bpmn-prop-input"
              />
            </Field>
            <Field label="Tipo de fluxo">
              <select
                value={edgeData?.bpmnKind ?? "default"}
                onChange={(e) => updateEdgeData(selectedEdge.id, { bpmnKind: (e.target.value === "default" ? undefined : e.target.value) as BpmnEdgeKind | undefined })}
                className="bpmn-prop-input"
              >
                <option value="default">Padrão (cinza)</option>
                <option value="primary">Principal (lime)</option>
                <option value="rework">Retrabalho (vermelho)</option>
                <option value="cross_lane">Entre raias (teal)</option>
                <option value="system">Sistema (azul)</option>
              </select>
            </Field>
          </>
        ) : !selectedNode ? (
          <p className="text-xs text-[var(--flux-text-muted)]">Selecione um elemento ou fluxo no canvas.</p>
        ) : (
          <>
            <Field label="ID">
              <input value={nodeId ?? ""} disabled className="bpmn-prop-input opacity-80" />
            </Field>
            <Field label="Label">
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                onBlur={() => nodeId && updateNodeData(nodeId, { label: label.trim() || data!.label })}
                className="bpmn-prop-input"
              />
            </Field>

            {data && isTaskLikeType(data.bpmnType) && (
              <>
                <Field label="Subtítulo">
                  <input
                    value={subtitle}
                    onChange={(e) => setSubtitle(e.target.value)}
                    onBlur={() => nodeId && updateNodeData(nodeId, { subtitle: subtitle.trim() || undefined })}
                    className="bpmn-prop-input"
                    placeholder="Ator, sistema, detalhe"
                  />
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Nº passo">
                    <input
                      value={stepNumber}
                      onChange={(e) => setStepNumber(e.target.value)}
                      onBlur={() => nodeId && updateNodeData(nodeId, { stepNumber: stepNumber.trim() || undefined })}
                      className="bpmn-prop-input"
                      placeholder="1, A…"
                    />
                  </Field>
                  <Field label="Pain badge">
                    <input
                      value={painBadge}
                      onChange={(e) => setPainBadge(e.target.value)}
                      onBlur={() => nodeId && updateNodeData(nodeId, { painBadge: painBadge.trim() || undefined })}
                      className="bpmn-prop-input"
                      placeholder="1–9"
                    />
                  </Field>
                </div>
                <Field label="Variante visual">
                  <select
                    value={data.semanticVariant ?? "default"}
                    onChange={(e) => nodeId && updateNodeData(nodeId, { semanticVariant: (e.target.value === "default" ? undefined : e.target.value) as BpmnSemanticVariant | undefined })}
                    className="bpmn-prop-input"
                  >
                    <option value="default">Padrão / manual</option>
                    <option value="delivered">Implementada / entregue</option>
                    <option value="automation">API / automação</option>
                    <option value="pain">Pain point</option>
                    <option value="system">Sistema (tracejado)</option>
                  </select>
                </Field>
              </>
            )}

            {/* Appearance */}
            {data && (
              <div className="space-y-2.5 rounded-lg border border-[var(--flux-border-default)] bg-[var(--flux-surface-elevated)] p-2.5">
                <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--flux-text-muted)]">Aparência</p>
                <ColorRow
                  label="Cor do texto"
                  value={data.labelColor ?? "#F0EEFF"}
                  swatches={["#F0EEFF", "#FFFFFF", "#A29BFE", "#FF6B6B", "#74B9FF"]}
                  onChange={(c) => nodeId && updateNodeData(nodeId, { labelColor: c })}
                  onReset={() => nodeId && updateNodeData(nodeId, { labelColor: undefined })}
                  hasOverride={data.labelColor !== undefined}
                />
                <ColorRow
                  label="Cor de fundo"
                  value={data.bgColor ?? "#221F3A"}
                  swatches={["#221F3A", "#2D2952", "#1A1730", "#F1F8E9", "#E0F7FA", "#FFEBEE"]}
                  onChange={(c) => nodeId && updateNodeData(nodeId, { bgColor: c })}
                  onReset={() => nodeId && updateNodeData(nodeId, { bgColor: undefined })}
                  hasOverride={data.bgColor !== undefined}
                />
                <ColorRow
                  label="Cor da borda"
                  value={data.borderColor ?? "#6C5CE7"}
                  swatches={["#6C5CE7", "#A29BFE", "#00D2D3", "#FF6B6B", "#74B9FF", "#FFD93D"]}
                  onChange={(c) => nodeId && updateNodeData(nodeId, { borderColor: c })}
                  onReset={() => nodeId && updateNodeData(nodeId, { borderColor: undefined })}
                  hasOverride={data.borderColor !== undefined}
                />
                <div className="flex items-center gap-2">
                  <label className="w-20 shrink-0 text-[11px] text-[var(--flux-text-muted)]">Tam. fonte</label>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      className="flex h-7 w-7 items-center justify-center rounded border border-[var(--flux-control-border)] bg-[var(--flux-surface-card)] text-xs font-bold text-[var(--flux-text-muted)] hover:border-[var(--flux-primary)]/50"
                      onClick={() => nodeId && updateNodeData(nodeId, { fontSize: Math.max(8, (data.fontSize ?? 13) - 1) })}
                    >−</button>
                    <span className="w-8 text-center text-[11px] font-mono font-bold text-[var(--flux-text)]">
                      {data.fontSize ?? 13}
                    </span>
                    <button
                      type="button"
                      className="flex h-7 w-7 items-center justify-center rounded border border-[var(--flux-control-border)] bg-[var(--flux-surface-card)] text-xs font-bold text-[var(--flux-text-muted)] hover:border-[var(--flux-primary)]/50"
                      onClick={() => nodeId && updateNodeData(nodeId, { fontSize: Math.min(32, (data.fontSize ?? 13) + 1) })}
                    >+</button>
                  </div>
                </div>
              </div>
            )}

            <Field label="Dica (tooltip)">
              <textarea
                value={tooltip}
                onChange={(e) => setTooltip(e.target.value)}
                onBlur={() => nodeId && updateNodeData(nodeId, { tooltip: tooltip.trim() || undefined })}
                rows={3}
                className="bpmn-prop-input"
                placeholder="Texto ao passar o mouse"
              />
            </Field>

            {data?.laneId && (
              <Field label="Tag da raia">
                <input
                  value={laneTag}
                  onChange={(e) => setLaneTag(e.target.value)}
                  onBlur={() => data.laneId && updateLane(data.laneId, { tag: laneTag.trim() || undefined })}
                  className="bpmn-prop-input"
                  placeholder="Ex.: AS-IS — Área de negócio"
                />
              </Field>
            )}
          </>
        )}
      </div>

      {/* Legend */}
      <div className="shrink-0 border-t border-[var(--flux-border-muted)] p-3">
        <BpmnLegend expanded={legendExpanded} onToggleExpanded={() => setLegendExpanded(!legendExpanded)} />
      </div>
    </aside>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-[11px] text-[var(--flux-text-muted)]">{label}</label>
      {children}
    </div>
  );
}

function ColorRow({
  label,
  value,
  swatches,
  onChange,
  onReset,
  hasOverride,
}: {
  label: string;
  value: string;
  swatches: string[];
  onChange: (c: string) => void;
  onReset: () => void;
  hasOverride: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <label className="w-20 shrink-0 text-[11px] text-[var(--flux-text-muted)]">{label}</label>
      <div className="flex items-center gap-1.5">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-7 w-10 cursor-pointer rounded border border-[var(--flux-control-border)] p-0.5"
        />
        <div className="flex gap-1">
          {swatches.map((c) => (
            <button
              key={c}
              type="button"
              title={c}
              className="h-5 w-5 rounded-full border-2 border-[var(--flux-border-subtle)] shadow-sm transition hover:scale-110"
              style={{ background: c }}
              onClick={() => onChange(c)}
            />
          ))}
        </div>
        {hasOverride && (
          <button
            type="button"
            className="text-[10px] text-[var(--flux-text-muted)] hover:text-[var(--flux-danger)]"
            title="Resetar"
            onClick={onReset}
          >↺</button>
        )}
      </div>
    </div>
  );
}

export const BpmnProperties = memo(BpmnPropertiesInner);
