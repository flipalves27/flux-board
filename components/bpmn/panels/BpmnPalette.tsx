"use client";

import { memo, useState, type DragEvent } from "react";
import type { BpmnNodeType, BpmnSemanticVariant } from "@/lib/bpmn-types";
import { useBpmnStore } from "@/stores/bpmn-store";
import {
  RebornStencilEventIcon,
  RebornStencilGatewayIcon,
} from "@/components/templates/bpmn-reborn-shapes";

type Stencil = {
  type: string;
  label: string;
  hint: string;
  category: "events" | "tasks" | "gateways" | "dados" | "swim";
  width: number;
  height: number;
  semanticVariant?: BpmnSemanticVariant;
  accentColor?: string;
};

const STENCILS: Stencil[] = [
  { type: "start_event", label: "Início", hint: "Início do processo", category: "events", width: 44, height: 44 },
  { type: "intermediate_event", label: "Intermediário", hint: "Evento intermediário", category: "events", width: 44, height: 44 },
  { type: "timer_event", label: "Timer", hint: "Temporizador", category: "events", width: 44, height: 44 },
  { type: "message_event", label: "Mensagem", hint: "Recebe / envia mensagem", category: "events", width: 44, height: 44 },
  { type: "end_event", label: "Fim", hint: "Fim do processo", category: "events", width: 44, height: 44 },

  { type: "task", label: "Tarefa — Padrão", hint: "Tarefa manual / padrão", category: "tasks", width: 160, height: 60, semanticVariant: "default", accentColor: "#00897B" },
  { type: "task", label: "Tarefa — Implementada", hint: "Já implementado / entregue", category: "tasks", width: 160, height: 60, semanticVariant: "reborn", accentColor: "#7CB342" },
  { type: "task", label: "Tarefa — Automação", hint: "Integração via API / sistêmica", category: "tasks", width: 160, height: 60, semanticVariant: "automation", accentColor: "#00ACC1" },
  { type: "task", label: "Tarefa — Pain Point", hint: "Retrabalho / ponto de dor", category: "tasks", width: 160, height: 60, semanticVariant: "pain", accentColor: "#EF5350" },
  { type: "task", label: "Tarefa — Sistema", hint: "Ação de sistema / serviço externo", category: "tasks", width: 160, height: 60, semanticVariant: "system", accentColor: "#42A5F5" },
  { type: "user_task", label: "User Task", hint: "Tarefa do usuário", category: "tasks", width: 160, height: 60, accentColor: "#00897B" },
  { type: "service_task", label: "Service Task", hint: "Tarefa de serviço", category: "tasks", width: 160, height: 60, accentColor: "#00ACC1" },
  { type: "script_task", label: "Script Task", hint: "Tarefa de script", category: "tasks", width: 160, height: 60, accentColor: "#5C6BC0" },
  { type: "call_activity", label: "Call Activity", hint: "Chamada a subprocesso", category: "tasks", width: 160, height: 60, accentColor: "#7E57C2" },
  { type: "sub_process", label: "Sub-processo", hint: "Subprocesso expandível", category: "tasks", width: 160, height: 60, accentColor: "#00897B" },

  { type: "exclusive_gateway", label: "XOR — Exclusivo", hint: "Decisão única (Sim/Não)", category: "gateways", width: 56, height: 56 },
  { type: "parallel_gateway", label: "AND — Paralelo", hint: "Execução paralela", category: "gateways", width: 56, height: 56 },
  { type: "inclusive_gateway", label: "OR — Inclusivo", hint: "Uma ou mais saídas", category: "gateways", width: 56, height: 56 },

  { type: "system_box", label: "System Box", hint: "Sistema / serviço externo integrado", category: "dados", width: 150, height: 60 },
  { type: "annotation", label: "Anotação", hint: "Nota / observação no diagrama", category: "dados", width: 160, height: 56 },
  { type: "data_object", label: "Documento", hint: "Artefato / documento de dados", category: "dados", width: 96, height: 60 },
];

const GROUP_LABELS: Record<string, string> = {
  events: "Eventos",
  tasks: "Atividades",
  gateways: "Gateways",
  dados: "Dados & Acessórios",
};

function BpmnPaletteInner() {
  const { paletteCollapsed, setPaletteCollapsed, addLane, lanes, nodes, edges } = useBpmnStore();
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set());

  function toggleGroup(group: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  }

  function onDragStart(e: DragEvent, stencil: Stencil) {
    e.dataTransfer.setData("application/x-bpmn-type", stencil.type);
    e.dataTransfer.setData("application/x-bpmn-width", String(stencil.width));
    e.dataTransfer.setData("application/x-bpmn-height", String(stencil.height));
    if (stencil.semanticVariant) {
      e.dataTransfer.setData("application/x-bpmn-variant", stencil.semanticVariant);
    }
    if (stencil.accentColor) {
      e.dataTransfer.setData("application/x-bpmn-accent", stencil.accentColor);
    }
    e.dataTransfer.effectAllowed = "move";
  }

  if (paletteCollapsed) {
    return (
      <aside className="flex min-h-0 flex-col gap-3 overflow-y-auto rounded-xl border border-[var(--flux-border-default)] bg-[var(--flux-surface-card)] p-2 shadow-[var(--flux-shadow-md)]">
        <button
          type="button"
          title="Expandir palette"
          className="ml-auto rounded-md border border-[var(--flux-border-default)] bg-[var(--flux-surface-elevated)] px-1.5 py-0.5 text-[11px] font-bold text-[var(--flux-text-muted)] transition hover:border-[var(--flux-primary)]/60 hover:text-[var(--flux-primary-light)]"
          onClick={() => setPaletteCollapsed(false)}
        >
          ▶
        </button>
        <div className="flex flex-col items-center gap-2 pt-1">
          {STENCILS.slice(0, 10).map((stencil, idx) => (
            <button
              key={`col_${stencil.type}_${idx}`}
              type="button"
              draggable
              title={stencil.label}
              onDragStart={(e) => onDragStart(e, stencil)}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200/90 bg-white shadow-sm hover:border-[#00897B]/50 dark:border-slate-600 dark:bg-slate-900"
            >
              {stencil.category === "events" ? (
                <RebornStencilEventIcon type={stencil.type as BpmnNodeType} />
              ) : stencil.category === "gateways" ? (
                <RebornStencilGatewayIcon type={stencil.type as BpmnNodeType} />
              ) : (
                <span className="h-5 w-1 rounded-full" style={{ background: stencil.accentColor ?? "#00897B" }} />
              )}
            </button>
          ))}
        </div>
      </aside>
    );
  }

  return (
    <aside className="flex min-h-0 flex-col gap-3 overflow-y-auto rounded-xl border border-[var(--flux-border-default)] bg-[var(--flux-surface-card)] p-3 shadow-[var(--flux-shadow-md)]">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-extrabold uppercase tracking-wide text-[var(--flux-text)]">
          Componentes
        </p>
        <button
          type="button"
          title="Recolher palette"
          className="ml-auto rounded-md border border-[var(--flux-border-default)] bg-[var(--flux-surface-elevated)] px-1.5 py-0.5 text-[11px] font-bold text-[var(--flux-text-muted)] transition hover:border-[var(--flux-primary)]/60 hover:text-[var(--flux-primary-light)]"
          onClick={() => setPaletteCollapsed(true)}
        >
          ◀
        </button>
      </div>

      <p className="text-[11px] leading-snug text-[var(--flux-text-muted)]">
        Arraste componentes para o canvas. Duplo clique no canvas para editar inline.
      </p>

      {/* Stencil groups */}
      {(["events", "tasks", "gateways", "dados"] as const).map((group) => {
        const items = STENCILS.filter((s) => s.category === group);
        const isCollapsed = collapsedGroups.has(group);
        return (
          <div key={group} className="overflow-hidden rounded-lg border border-[var(--flux-border-default)] bg-[var(--flux-surface-elevated)]">
            <button
              type="button"
              className="flex w-full items-center justify-between px-2.5 py-2 text-left transition hover:bg-[var(--flux-primary)]/10"
              onClick={() => toggleGroup(group)}
            >
              <span className="text-[10px] font-bold uppercase tracking-wide text-[var(--flux-text-muted)]">
                {GROUP_LABELS[group]}
              </span>
              <span
                className="text-[10px] text-[var(--flux-text-muted)] transition-transform duration-200"
                style={{ display: "inline-block", transform: isCollapsed ? "rotate(0deg)" : "rotate(90deg)" }}
              >
                ▶
              </span>
            </button>
            {!isCollapsed && (
              <div className="grid grid-cols-1 gap-1 px-2 pb-2">
                {items.map((stencil, idx) => (
                  <button
                    key={`${stencil.type}_${stencil.semanticVariant ?? idx}`}
                    type="button"
                    draggable
                    onDragStart={(e) => onDragStart(e, stencil)}
                    className="text-left transition hover:opacity-95"
                    title={stencil.hint}
                  >
                    <div className="flex items-center gap-2.5 rounded-[8px] border border-[var(--flux-border-subtle)] bg-[var(--flux-surface-card)] px-2.5 py-2 shadow-[var(--flux-shadow-sm)] transition hover:border-[var(--flux-primary)]/40 hover:shadow-[var(--flux-shadow-md)]">
                      <span className="pointer-events-none shrink-0">
                        {stencil.category === "events" ? (
                          <RebornStencilEventIcon type={stencil.type as BpmnNodeType} />
                        ) : stencil.category === "gateways" ? (
                          <RebornStencilGatewayIcon type={stencil.type as BpmnNodeType} />
                        ) : stencil.category === "dados" && stencil.type === "annotation" ? (
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[0_6px_6px_0] border-l-4 bg-[#FFFDE7]" style={{ borderLeftColor: "#FFB300" }}>
                            <span className="text-[14px]">✎</span>
                          </span>
                        ) : stencil.category === "dados" && stencil.type === "system_box" ? (
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[6px] border-2 border-dashed bg-[var(--flux-surface-elevated)]" style={{ borderColor: "var(--flux-primary)" }}>
                            <span className="text-[12px]">⚙</span>
                          </span>
                        ) : stencil.category === "dados" ? (
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-[var(--flux-border-subtle)] bg-[var(--flux-surface-elevated)] text-[14px]">
                            📄
                          </span>
                        ) : (
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] border border-[var(--flux-border-subtle)] bg-[var(--flux-surface-elevated)] shadow-sm">
                            <span className="h-6 w-1.5 rounded-full" style={{ background: stencil.accentColor ?? "#6C5CE7" }} aria-hidden />
                          </span>
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[11px] font-bold leading-tight text-[var(--flux-text)]">{stencil.label}</span>
                        <span className="mt-0.5 block truncate text-[10px] font-medium leading-snug text-[var(--flux-text-muted)]">{stencil.hint}</span>
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* Swim Lanes */}
      <div className="space-y-2 rounded-lg border border-[var(--flux-border-default)] bg-[var(--flux-surface-elevated)] p-2.5">
        <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--flux-text-muted)]">Swim Lanes</p>

        {/* Draggable swim lane stencil */}
        <button
          type="button"
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData("application/x-bpmn-type", "swim_lane");
            e.dataTransfer.setData("application/x-bpmn-width", "2400");
            e.dataTransfer.setData("application/x-bpmn-height", "160");
            e.dataTransfer.effectAllowed = "move";
          }}
          className="w-full rounded-[10px] border border-dashed border-[var(--flux-primary)]/50 bg-[var(--flux-surface-card)] px-2.5 py-2 text-left shadow-sm transition hover:border-[var(--flux-primary)] hover:shadow-[var(--flux-shadow-primary-soft)]"
          title="Arraste para o canvas ou clique para adicionar"
          onClick={addLane}
        >
          <span className="flex items-center gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md" style={{ background: "linear-gradient(180deg, #00695C, #00897B)" }}>
              <span className="text-[10px] font-extrabold text-white" style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}>▤</span>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[11px] font-bold leading-tight" style={{ color: "var(--flux-primary-light)" }}>
                Swim Lane
              </span>
              <span className="mt-0.5 block text-[10px] text-[var(--flux-text-muted)]">
                Arraste ou clique para criar
              </span>
            </span>
          </span>
        </button>

        {/* Lane list */}
        {lanes.length > 0 && (
          <div className="mt-1 space-y-1">
            <p className="text-[10px] font-semibold text-[var(--flux-text-muted)]">{lanes.length} raia{lanes.length > 1 ? "s" : ""} ativas:</p>
            {lanes.map((lane) => (
              <div key={lane.id} className="flex items-center gap-2 rounded-md border border-[var(--flux-border-subtle)] bg-[var(--flux-surface-card)] px-2 py-1.5">
                <span
                  className="h-4 w-4 shrink-0 rounded-sm"
                  style={{
                    background: lane.gradient
                      ? `linear-gradient(180deg, ${lane.gradient[0]}, ${lane.gradient[1]})`
                      : "linear-gradient(180deg, #00695C, #00897B)",
                  }}
                />
                <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-[var(--flux-text)]">
                  {lane.label}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="text-[11px] text-[#546E7A] dark:text-slate-400">
        {nodes.length} nós • {edges.length} fluxos
      </p>
    </aside>
  );
}

export const BpmnPalette = memo(BpmnPaletteInner);
