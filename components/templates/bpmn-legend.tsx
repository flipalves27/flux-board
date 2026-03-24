"use client";

import type { ReactNode } from "react";

type Props = {
  className?: string;
  collapsed: boolean;
  onToggleCollapsed: () => void;
};

export function BpmnLegend({ className = "", collapsed, onToggleCollapsed }: Props) {
  return (
    <div
      className={`pointer-events-auto z-[500] rounded-[14px] bg-white p-4 shadow-[0_8px_28px_rgba(26,39,68,0.18)] transition-transform duration-300 dark:bg-[#1e293b] dark:shadow-black/40 ${className} ${
        collapsed ? "-translate-x-[calc(100%+12px)]" : "translate-x-0"
      }`}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <h4 className="font-semibold text-[13px] uppercase tracking-wide text-[#1A2744] dark:text-slate-200">Legenda BPMN</h4>
        <button
          type="button"
          onClick={onToggleCollapsed}
          className="rounded-md px-2 py-0.5 text-[11px] font-semibold text-[#546E7A] hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
          aria-expanded={!collapsed}
        >
          {collapsed ? "Mostrar" : "Ocultar"}
        </button>
      </div>
      <ul className="space-y-1.5 text-[12px] text-[#546E7A] dark:text-slate-400">
        <LegendRow swatchClass="bg-[#F1F8E9] border-2 border-[#7CB342]" label="Já no produto / Reborn" />
        <LegendRow swatchClass="bg-[#E0F7FA] border-2 border-[#00ACC1]" label="Automação / API" />
        <LegendRow swatchClass="bg-white border-2 border-[#00897B]" label="Tarefa manual" />
        <LegendRow swatchClass="bg-[#FFEBEE] border-2 border-[#EF5350]" label="Pain point / retrabalho" />
        <LegendRow swatchClass="bg-[#E8EAF6] border-2 border-dashed border-[#5C6BC0]" label="Sistema / serviço" />
        <LegendRow
          swatch={<span className="inline-block h-4 w-4 rotate-45 rounded-[2px] border-2 border-[#FFB300] bg-[#FFE082]" />}
          label="Gateway (decisão)"
        />
      </ul>
      <div className="mt-3 border-t border-slate-200 pt-3 dark:border-slate-600">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#1A2744] dark:text-slate-300">Fluxos</p>
        <ul className="space-y-1.5 text-[12px] text-[#546E7A] dark:text-slate-400">
          <LegendLine color="#7CB342" dashed={false} label="Fluxo principal" />
          <LegendLine color="#00897B" dashed label="Transição entre raias" />
          <LegendLine color="#EF5350" dashed label="Retorno / retrabalho" />
        </ul>
      </div>
      <p className="mt-3 border-t border-slate-200 pt-2 text-[11px] italic text-[#90A4AE] dark:border-slate-600 dark:text-slate-500">
        Arraste o fundo para mover · Roda do mouse para zoom · Alt+arrastar para pan
      </p>
    </div>
  );
}

function LegendRow({ swatchClass, swatch, label }: { swatchClass?: string; swatch?: ReactNode; label: string }) {
  return (
    <li className="flex items-center gap-2.5">
      {swatch ?? <span className={`h-4 w-6 shrink-0 rounded ${swatchClass}`} />}
      <span>{label}</span>
    </li>
  );
}

function LegendLine({ color, dashed, label }: { color: string; dashed: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2.5">
      <span className="inline-block h-0 w-6 shrink-0 border-t-[3px]" style={{ borderColor: color, borderStyle: dashed ? "dashed" : "solid" }} />
      <span>{label}</span>
    </li>
  );
}
