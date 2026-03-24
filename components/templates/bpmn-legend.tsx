"use client";

import { useCallback, useEffect, useId, useState, type ReactNode } from "react";

const STORAGE_KEY = "flux-bpmn-legend-labels-v1";

type LegendLabels = {
  events: string[];
  tasks: string[];
  gateways: string[];
  flows: string[];
  footerHint: string;
};

const DEFAULT_LABELS: LegendLabels = {
  events: ["Início (evento de início)", "Fim (evento de término)", "Intermediário / timer"],
  tasks: [
    "Já no produto / Reborn",
    "Automação / API",
    "Tarefa manual",
    "Pain point / retrabalho",
    "Sistema / serviço",
  ],
  gateways: ["Gateway exclusivo (decisão XOR)", "Gateway paralelo (AND)"],
  flows: ["Fluxo principal", "Transição entre raias", "Retorno / retrabalho"],
  footerHint: "Arraste o fundo para mover · Roda do mouse para zoom · Alt+arrastar para pan",
};

function loadLabels(): LegendLabels {
  if (typeof window === "undefined") return DEFAULT_LABELS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_LABELS;
    const parsed = JSON.parse(raw) as Partial<LegendLabels>;
    return {
      events: parsed.events?.length ? parsed.events : DEFAULT_LABELS.events,
      tasks: parsed.tasks?.length ? parsed.tasks : DEFAULT_LABELS.tasks,
      gateways: parsed.gateways?.length ? parsed.gateways : DEFAULT_LABELS.gateways,
      flows: parsed.flows?.length ? parsed.flows : DEFAULT_LABELS.flows,
      footerHint: typeof parsed.footerHint === "string" ? parsed.footerHint : DEFAULT_LABELS.footerHint,
    };
  } catch {
    return DEFAULT_LABELS;
  }
}

type Props = {
  className?: string;
  /** Painel da legenda visível (expandido na coluna). */
  expanded: boolean;
  onToggleExpanded: () => void;
};

export function BpmnLegend({ className = "", expanded, onToggleExpanded }: Props) {
  const baseId = useId();
  const [labels, setLabels] = useState<LegendLabels>(DEFAULT_LABELS);

  useEffect(() => {
    setLabels(loadLabels());
  }, []);

  const persist = useCallback((next: LegendLabels) => {
    setLabels(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }, []);

  const updateRow = useCallback(
    (section: keyof Omit<LegendLabels, "footerHint">, index: number, value: string) => {
      setLabels((prev) => {
        const arr = [...prev[section]];
        arr[index] = value;
        const next = { ...prev, [section]: arr };
        try {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch {
          /* ignore */
        }
        return next;
      });
    },
    [],
  );

  const updateFooter = useCallback((footerHint: string) => {
    setLabels((prev) => {
      const next = { ...prev, footerHint };
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  return (
    <div className={`rounded-lg border border-slate-200/90 bg-[#F8FAFC] dark:border-slate-600 dark:bg-slate-950/50 ${className}`}>
      <div className="flex items-center justify-between gap-2 border-b border-slate-200/80 px-2.5 py-2 dark:border-slate-600">
        <h4 className="font-semibold text-[11px] uppercase tracking-wide text-[#1A2744] dark:text-slate-200">Legenda BPMN</h4>
        <button
          type="button"
          onClick={onToggleExpanded}
          className="rounded-md px-2 py-0.5 text-[10px] font-semibold text-[#546E7A] hover:bg-slate-200/80 dark:text-slate-400 dark:hover:bg-slate-800"
          aria-expanded={expanded}
        >
          {expanded ? "Ocultar" : "Mostrar"}
        </button>
      </div>

      {expanded ? (
        <div className="max-h-[min(420px,50vh)] space-y-1 overflow-y-auto px-2.5 py-2">
          <p className="text-[10px] leading-snug text-[#546E7A] dark:text-slate-500">
            Textos editáveis (guardados neste navegador). Clique nos grupos para expandir.
          </p>

          <CollapsibleGroup id={`${baseId}-ev`} title="Eventos">
            <ul className="space-y-1.5">
              <LegendEventRow label={labels.events[0] ?? ""} onChange={(v) => updateRow("events", 0, v)} swatch="start" />
              <LegendEventRow label={labels.events[1] ?? ""} onChange={(v) => updateRow("events", 1, v)} swatch="end" />
              <LegendEventRow label={labels.events[2] ?? ""} onChange={(v) => updateRow("events", 2, v)} swatch="intermediate" />
            </ul>
          </CollapsibleGroup>

          <CollapsibleGroup id={`${baseId}-tasks`} title="Tarefas">
            <ul className="space-y-1.5">
              <LegendTaskRow swatchClass="bg-[#F1F8E9] border-2 border-[#7CB342]" label={labels.tasks[0] ?? ""} onChange={(v) => updateRow("tasks", 0, v)} />
              <LegendTaskRow swatchClass="bg-[#E0F7FA] border-2 border-[#00ACC1]" label={labels.tasks[1] ?? ""} onChange={(v) => updateRow("tasks", 1, v)} />
              <LegendTaskRow swatchClass="bg-white border-2 border-[#00897B]" label={labels.tasks[2] ?? ""} onChange={(v) => updateRow("tasks", 2, v)} />
              <LegendTaskRow swatchClass="bg-[#FFEBEE] border-2 border-[#EF5350]" label={labels.tasks[3] ?? ""} onChange={(v) => updateRow("tasks", 3, v)} />
              <LegendTaskRow swatchClass="bg-[#E8EAF6] border-2 border-dashed border-[#5C6BC0]" label={labels.tasks[4] ?? ""} onChange={(v) => updateRow("tasks", 4, v)} />
            </ul>
          </CollapsibleGroup>

          <CollapsibleGroup id={`${baseId}-gw`} title="Gateways">
            <ul className="space-y-1.5">
              <li className="flex items-start gap-2">
                <span className="mt-0.5 inline-block h-4 w-4 shrink-0 rotate-45 rounded-[2px] border-2 border-[#FFB300] bg-[#FFE082]" aria-hidden />
                <input
                  type="text"
                  value={labels.gateways[0] ?? ""}
                  onChange={(e) => updateRow("gateways", 0, e.target.value)}
                  className="min-w-0 flex-1 rounded border border-transparent bg-white/80 px-1 py-0.5 text-[11px] text-[#546E7A] hover:border-slate-200 focus:border-[#00897B]/50 focus:outline-none dark:bg-slate-900/80 dark:text-slate-400 dark:hover:border-slate-600"
                />
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center" aria-hidden>
                  <span className="inline-block h-3 w-3 rotate-45 rounded-[1px] border border-[#00897B] bg-[#B2DFDB]/90" />
                </span>
                <input
                  type="text"
                  value={labels.gateways[1] ?? ""}
                  onChange={(e) => updateRow("gateways", 1, e.target.value)}
                  className="min-w-0 flex-1 rounded border border-transparent bg-white/80 px-1 py-0.5 text-[11px] text-[#546E7A] hover:border-slate-200 focus:border-[#00897B]/50 focus:outline-none dark:bg-slate-900/80 dark:text-slate-400 dark:hover:border-slate-600"
                />
              </li>
            </ul>
          </CollapsibleGroup>

          <CollapsibleGroup id={`${baseId}-flows`} title="Fluxos">
            <ul className="space-y-1.5">
              <LegendLine color="#7CB342" dashed={false} label={labels.flows[0] ?? ""} onChange={(v) => updateRow("flows", 0, v)} />
              <LegendLine color="#00897B" dashed label={labels.flows[1] ?? ""} onChange={(v) => updateRow("flows", 1, v)} />
              <LegendLine color="#EF5350" dashed label={labels.flows[2] ?? ""} onChange={(v) => updateRow("flows", 2, v)} />
            </ul>
          </CollapsibleGroup>

          <div className="border-t border-slate-200/80 pt-2 dark:border-slate-600">
            <label className="text-[10px] font-semibold uppercase tracking-wide text-[#1A2744] dark:text-slate-300">Dica do canvas</label>
            <textarea
              value={labels.footerHint}
              onChange={(e) => updateFooter(e.target.value)}
              rows={2}
              className="mt-1 w-full resize-y rounded border border-slate-200/90 bg-white px-2 py-1.5 text-[10px] italic text-[#90A4AE] focus:border-[#00897B]/50 focus:outline-none dark:border-slate-600 dark:bg-slate-900 dark:text-slate-500"
            />
          </div>

          <button
            type="button"
            className="mt-1 w-full rounded border border-slate-200/80 py-1 text-[10px] font-semibold text-[#546E7A] hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800"
            onClick={() => persist(DEFAULT_LABELS)}
          >
            Restaurar textos padrão
          </button>
        </div>
      ) : (
        <p className="px-2.5 py-2 text-[10px] text-[#546E7A] dark:text-slate-500">Use &quot;Mostrar&quot; para ver e editar a legenda.</p>
      )}
    </div>
  );
}

function CollapsibleGroup({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <details
      id={id}
      className="group rounded-md border border-slate-200/70 bg-white/60 open:bg-white dark:border-slate-700 dark:bg-slate-900/40 dark:open:bg-slate-900/70"
    >
      <summary className="cursor-pointer list-none px-2 py-1.5 text-[11px] font-bold uppercase tracking-wide text-[#546E7A] marker:content-none dark:text-slate-400 [&::-webkit-details-marker]:hidden">
        <span className="flex items-center justify-between gap-2">
          {title}
          <span className="text-[10px] font-normal text-[#90A4AE] group-open:rotate-180 transition-transform">▼</span>
        </span>
      </summary>
      <div className="border-t border-slate-100 px-2 pb-2 pt-1.5 dark:border-slate-700">{children}</div>
    </details>
  );
}

function LegendTaskRow({
  swatchClass,
  label,
  onChange,
}: {
  swatchClass: string;
  label: string;
  onChange: (v: string) => void;
}) {
  return (
    <li className="flex items-center gap-2">
      <span className={`h-4 w-6 shrink-0 rounded ${swatchClass}`} aria-hidden />
      <input
        type="text"
        value={label}
        onChange={(e) => onChange(e.target.value)}
        className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 text-[11px] text-[#546E7A] hover:border-slate-200 focus:border-[#00897B]/50 focus:outline-none dark:text-slate-400 dark:hover:border-slate-600"
      />
    </li>
  );
}

function LegendEventRow({
  swatch,
  label,
  onChange,
}: {
  swatch: "start" | "end" | "intermediate";
  label: string;
  onChange: (v: string) => void;
}) {
  const swatchNode =
    swatch === "start" ? (
      <span className="relative flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-[#43A047] bg-[#E8F5E9]" aria-hidden>
        <span className="text-[8px] font-bold text-[#2E7D32">▶</span>
      </span>
    ) : swatch === "end" ? (
      <span className="relative flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-[3px] border-[#C62828] bg-white dark:bg-slate-900" aria-hidden />
    ) : (
      <span className="relative flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-[#FB8C00] bg-amber-50 dark:bg-amber-950/40" aria-hidden>
        <span className="h-2 w-2 rounded-full bg-[#FB8C00]" />
      </span>
    );

  return (
    <li className="flex items-center gap-2">
      {swatchNode}
      <input
        type="text"
        value={label}
        onChange={(e) => onChange(e.target.value)}
        className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 text-[11px] text-[#546E7A] hover:border-slate-200 focus:border-[#00897B]/50 focus:outline-none dark:text-slate-400 dark:hover:border-slate-600"
      />
    </li>
  );
}

function LegendLine({
  color,
  dashed,
  label,
  onChange,
}: {
  color: string;
  dashed: boolean;
  label: string;
  onChange: (v: string) => void;
}) {
  return (
    <li className="flex items-center gap-2">
      <span className="inline-block h-0 w-6 shrink-0 border-t-[3px]" style={{ borderColor: color, borderStyle: dashed ? "dashed" : "solid" }} />
      <input
        type="text"
        value={label}
        onChange={(e) => onChange(e.target.value)}
        className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 text-[11px] text-[#546E7A] hover:border-slate-200 focus:border-[#00897B]/50 focus:outline-none dark:text-slate-400 dark:hover:border-slate-600"
      />
    </li>
  );
}
