import { CheckIcon, ChevronDownIcon, DashIcon } from "./landing-icons";

export function FeatureRow({ label, included, dim = false }: { label: string; included: boolean; dim?: boolean }) {
  return (
    <li className={`flex items-start gap-2.5 text-sm leading-snug ${dim ? "text-[var(--flux-text-muted)]/55" : "text-[var(--flux-text-muted)]"}`}>
      <span className={`mt-0.5 shrink-0 ${included ? "text-[var(--flux-success)]" : "text-[var(--flux-text-muted)]/30"}`}>
        {included ? <CheckIcon className="w-[15px] h-[15px]" /> : <DashIcon className="w-[15px] h-[15px]" />}
      </span>
      <span>{label}</span>
    </li>
  );
}

export function FaqItem({
  question,
  answer,
  open,
  onToggle,
  faqId,
}: {
  question: string;
  answer: string;
  open: boolean;
  onToggle: () => void;
  /** Âncora estável para links (ex. #landing-faq-0). */
  faqId?: number;
}) {
  return (
    <div
      id={faqId !== undefined ? `landing-faq-${faqId}` : undefined}
      className="rounded-[var(--flux-rad-lg)] border border-[var(--flux-primary-alpha-15)] bg-[var(--flux-surface-card)] overflow-hidden transition-colors hover:border-[var(--flux-primary-alpha-22)] scroll-mt-28"
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start justify-between gap-4 px-5 py-4 text-left font-display text-sm font-semibold md:text-base"
        aria-expanded={open}
      >
        <span>{question}</span>
        <span
          className="mt-0.5 shrink-0 text-[var(--flux-text-muted)] transition-transform duration-200"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
        >
          <ChevronDownIcon className="w-4 h-4" />
        </span>
      </button>
      {open && (
        <div className="border-t border-[var(--flux-primary-alpha-10)] px-5 pb-5 pt-4 text-sm leading-relaxed text-[var(--flux-text-muted)]">{answer}</div>
      )}
    </div>
  );
}

export function PlanChip({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-[var(--flux-primary-alpha-30)] bg-[var(--flux-surface-elevated)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--flux-primary-light)]">
      {label}
    </span>
  );
}
