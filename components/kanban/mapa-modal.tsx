"use client";

import { useState, useRef } from "react";
import type { ReactNode } from "react";
import { CustomTooltip } from "@/components/ui/custom-tooltip";
import { useModalA11y } from "@/components/ui/use-modal-a11y";
import { useTranslations } from "next-intl";

interface MapaItem {
  papel: string;
  equipe: string;
  linha: string;
  operacoes: string;
}

interface MapaModalProps {
  mapaProducao: MapaItem[];
  onClose: () => void;
  onSave: (arr: MapaItem[]) => void;
}

const DEFAULT_MAPA: MapaItem[] = [
  { papel: "Corretor", equipe: "Comercial", linha: "Todas as Linhas", operacoes: "SERPRO (RF), SUSEP" },
  { papel: "Cliente / Pagador", equipe: "D&O", linha: "Financial Lines", operacoes: "SERPRO (RF), SERASA" },
  { papel: "Cliente", equipe: "E&O, RCG, Petróleo", linha: "Garantia — RC Profissional, RC Geral, Energy, Subscrição", operacoes: "SERPRO (RF)" },
  { papel: "Tomador", equipe: "Comercial", linha: "Garantia", operacoes: "SERPRO (RF), SERASA" },
];

type ValidacaoIntegrada = {
  id: "serpro" | "susep" | "serasa";
  nome: string;
  short: string; // Usado para match com strings vindas de `operacoes`
  descricao: string;
  icon: ReactNode;
  color: string;
  bg: string;
  border: string;
};

function getValidacoesIntegradas(t: (key: string) => string): ValidacaoIntegrada[] {
  return [
    {
      id: "serpro",
      nome: t("mapaModal.validations.serpro.name"),
      short: "SERPRO (RF)",
      descricao: t("mapaModal.validations.serpro.description"),
      icon: (
        <svg
          className="w-6 h-6"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <path d="M14 2v6h6" />
          <path d="M16 13H8" />
          <path d="M16 17H8" />
          <path d="M10 9H8" />
        </svg>
      ),
      color: "text-teal-700",
      bg: "bg-[rgba(13,148,136,0.12)]",
      border: "border-[rgba(13,148,136,0.35)]",
    },
    {
      id: "susep",
      nome: t("mapaModal.validations.susep.name"),
      short: "SUSEP",
      descricao: t("mapaModal.validations.susep.description"),
      icon: (
        <svg
          className="w-6 h-6"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
      ),
      color: "text-indigo-700",
      bg: "bg-[rgba(79,70,229,0.1)]",
      border: "border-[rgba(79,70,229,0.35)]",
    },
    {
      id: "serasa",
      nome: t("mapaModal.validations.serasa.name"),
      short: "SERASA",
      descricao: t("mapaModal.validations.serasa.description"),
      icon: (
        <svg
          className="w-6 h-6"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 2v4" />
          <path d="M12 18v4" />
          <path d="m4.93 4.93 3.54 3.54" />
          <path d="m15.54 15.54 3.54 3.54" />
          <path d="M2 12h4" />
          <path d="M18 12h4" />
          <path d="m4.93 19.07 3.54-3.54" />
          <path d="m15.54 8.46 3.54-3.54" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      ),
      color: "text-rose-800",
      bg: "bg-[rgba(185,28,28,0.1)]",
      border: "border-[rgba(185,28,28,0.35)]",
    },
  ];
}

function getOpInfo(
  operacoesStr: string,
  validacoesIntegradas: ValidacaoIntegrada[]
): { key: string; label: string }[] {
  const ops = (operacoesStr || "").split(/[,;]/).map((o) => o.trim()).filter(Boolean);
  return ops.map((o) => {
    const info = validacoesIntegradas.find(
      (v) => o.toUpperCase().includes(v.short.toUpperCase()) || (v.id === "serpro" && /RF|SERPRO/i.test(o))
    );
    return { key: info?.id ?? "outro", label: o };
  });
}

function opBadgeClass(key: string): string {
  if (key === "serpro") return "bg-[rgba(13,148,136,0.14)] text-[#0D9488] border-[rgba(13,148,136,0.4)]";
  if (key === "susep") return "bg-[rgba(79,70,229,0.12)] text-[#4F46E5] border-[rgba(79,70,229,0.35)]";
  if (key === "serasa") return "bg-[rgba(185,28,28,0.12)] text-[#B91C1C] border-[rgba(185,28,28,0.4)]";
  return "bg-[var(--flux-surface-elevated)] text-[var(--flux-text)] border-[rgba(255,255,255,0.12)]";
}

export function MapaModal({ mapaProducao, onClose, onSave }: MapaModalProps) {
  const t = useTranslations("kanban");
  const validacoesIntegradas = getValidacoesIntegradas(t);
  const [data, setData] = useState<MapaItem[]>(
    mapaProducao?.length ? [...mapaProducao] : [...DEFAULT_MAPA]
  );
  const [selectedCard, setSelectedCard] = useState<number | null>(null);

  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  useModalA11y({
    open: true,
    onClose,
    containerRef: dialogRef,
    initialFocusRef: closeBtnRef,
  });

  const update = (idx: number, field: keyof MapaItem, value: string) => {
    setData((prev) => {
      const next = [...prev];
      if (!next[idx]) next[idx] = { papel: "", equipe: "", linha: "", operacoes: "" };
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
  };

  const handleSave = () => {
    onSave(data);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 z-[300] flex items-center justify-center backdrop-blur-sm p-4 modal-overlay-animate"
      onClick={onClose}
    >
      <div
        className="bg-[var(--flux-surface-card)] border border-[rgba(108,92,231,0.2)] rounded-2xl w-full max-w-[960px] max-h-[90vh] overflow-y-auto shadow-xl relative modal-content-animate"
        onClick={(e) => e.stopPropagation()}
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="mapa-modal-title"
        tabIndex={-1}
      >
        <button
          type="button"
          onClick={onClose}
          ref={closeBtnRef}
          className="absolute top-4 right-4 w-9 h-9 rounded-full border border-[rgba(255,255,255,0.12)] bg-[var(--flux-surface-elevated)] text-[var(--flux-text-muted)] flex items-center justify-center text-lg hover:bg-[rgba(255,255,255,0.08)] hover:text-[var(--flux-text)] transition-all duration-200"
        >
          ×
        </button>

        <div className="p-6 pb-2">
          <div className="flex items-center gap-2 mb-2">
            <span className="bg-[var(--flux-primary)] text-white px-2.5 py-1 rounded-lg text-xs font-semibold tracking-wide font-display">
              {t("mapaModal.executiveView.badge")}
            </span>
            <span id="mapa-modal-title" className="font-display font-bold text-xl text-[var(--flux-text)]">
              {t("mapaModal.executiveView.title")}
            </span>
          </div>
          <p className="text-sm text-[var(--flux-text-muted)] leading-relaxed mb-6 max-w-[720px]">
            {t("mapaModal.executiveView.description")}
          </p>

          <div className="mb-8">
            <h3 className="font-display font-bold text-sm text-[var(--flux-text)] uppercase tracking-wider mb-3 flex items-center gap-2">
              <span className="w-8 h-8 rounded-lg bg-[var(--flux-primary)]/15 flex items-center justify-center text-[var(--flux-primary-light)]">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
              </span>
              {t("mapaModal.sections.integrations.title")}
            </h3>
            <p className="text-xs text-[var(--flux-text-muted)] mb-4">
              {t("mapaModal.sections.integrations.description")}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {validacoesIntegradas.map((v) => (
                <div
                  key={v.id}
                  className={`rounded-xl border-2 p-4 transition-all duration-200 hover:shadow-md ${v.bg} ${v.border}`}
                >
                  <div className={`flex items-center gap-3 mb-2 ${v.color}`}>
                    <span className="flex-shrink-0">{v.icon}</span>
                    <span className="font-display font-bold text-sm">{v.nome}</span>
                  </div>
                  <p className="text-xs text-[var(--flux-text-muted)] leading-relaxed">{v.descricao}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="mb-6">
            <h3 className="font-display font-bold text-sm text-[var(--flux-text)] uppercase tracking-wider mb-3 flex items-center gap-2">
              <span className="w-8 h-8 rounded-lg bg-[var(--flux-success)]/15 flex items-center justify-center text-[var(--flux-success)]">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                  <path d="M9 22V12h6v10" />
                </svg>
              </span>
              {t("mapaModal.sections.inProduction.title")}
            </h3>
            <p className="text-xs text-[var(--flux-text-muted)] mb-4">
              {t("mapaModal.sections.inProduction.description")}
            </p>
            <div className="space-y-3">
              {data.map((d, i) => (
                <div
                  key={i}
                  onFocus={() => setSelectedCard(i)}
                  onBlur={() => setSelectedCard(null)}
                  className={`rounded-xl border-2 p-4 transition-all duration-200 grid grid-cols-1 md:grid-cols-[auto_1fr_1fr_minmax(180px,1.2fr)_1.4fr] gap-3 items-center ${
                    selectedCard === i
                      ? "bg-[rgba(108,92,231,0.08)] border-[var(--flux-primary)] shadow-md"
                      : "bg-[var(--flux-surface-elevated)] border-[rgba(255,255,255,0.12)] hover:bg-[rgba(108,92,231,0.05)] hover:border-[var(--flux-primary)]/50"
                  }`}
                >
                  <div className="flex items-center justify-center w-10 h-10 rounded-full bg-[var(--flux-success)]/15 text-[var(--flux-success)] flex-shrink-0">
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                      <path d="M22 4 12 14.01l-3-3" />
                    </svg>
                  </div>
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-[var(--flux-text-muted)] font-semibold block mb-0.5 font-display">
                      {t("mapaModal.fields.role")}
                    </label>
                    <input
                      type="text"
                      value={d.papel}
                      onChange={(e) => update(i, "papel", e.target.value)}
                      className="w-full bg-transparent border-none outline-none text-sm font-bold text-[var(--flux-text)] focus:ring-0 p-0"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-[var(--flux-text-muted)] font-semibold block mb-0.5 font-display">
                      {t("mapaModal.fields.team")}
                    </label>
                    <input
                      type="text"
                      value={d.equipe}
                      onChange={(e) => update(i, "equipe", e.target.value)}
                      className="w-full bg-transparent border-none outline-none text-sm text-[var(--flux-text-muted)] focus:ring-0 p-0"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-[var(--flux-text-muted)] font-semibold block mb-0.5 font-display">
                      {t("mapaModal.fields.businessLine")}
                    </label>
                    <input
                      type="text"
                      value={d.linha}
                      onChange={(e) => update(i, "linha", e.target.value)}
                      className="w-full bg-transparent border-none outline-none text-sm text-[var(--flux-text-muted)] focus:ring-0 p-0"
                    />
                  </div>
                  <div className="relative">
                    <label className="text-[10px] uppercase tracking-wider text-[var(--flux-text-muted)] font-semibold block mb-1.5 font-display">
                      {t("mapaModal.fields.validations")}
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {getOpInfo(d.operacoes, validacoesIntegradas).map((op, j) => {
                        const info = validacoesIntegradas.find((v) => v.id === op.key);
                        return (
                          <CustomTooltip key={j} content={info?.descricao || ""} disabled={!info?.descricao}>
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold border ${opBadgeClass(op.key)} cursor-help`}
                            >
                              {op.label}
                            </span>
                          </CustomTooltip>
                        );
                      })}
                    </div>
                    <input
                      type="text"
                      value={d.operacoes}
                      onChange={(e) => update(i, "operacoes", e.target.value)}
                      placeholder={t("mapaModal.fields.validationsPlaceholder")}
                      className="mt-1.5 w-full bg-[var(--flux-surface-elevated)] border border-[rgba(255,255,255,0.12)] rounded-lg px-2 py-1 text-xs text-[var(--flux-text)] placeholder-[var(--flux-text-muted)] focus:border-[var(--flux-primary)] focus:ring-1 focus:ring-[var(--flux-primary)]/30 outline-none"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-3 justify-end pt-4 border-t border-[rgba(255,255,255,0.08)]">
            <button type="button" onClick={onClose} className="btn-secondary">
              {t("mapaModal.buttons.cancel")}
            </button>
            <button type="button" onClick={handleSave} className="btn-primary">
              {t("mapaModal.buttons.save")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
