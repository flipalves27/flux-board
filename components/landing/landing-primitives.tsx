import { CheckIcon, ChevronDownIcon, DashIcon } from "./landing-icons";

export function FeatureRow({ label, included, dim = false }: { label: string; included: boolean; dim?: boolean }) {
  return (
    <li
      className={`flex items-start gap-2 text-[13px] leading-snug ${dim ? "text-[var(--flux-text-muted)]/55" : included ? "text-[var(--flux-text-muted)]" : "text-[var(--flux-text-muted)]/50"}`}
    >
      <span className={`mt-0.5 shrink-0 ${included ? "text-[var(--flux-success)]" : "text-[var(--flux-text-muted)]/30"}`}>
        {included ? <CheckIcon className="h-4 w-4" /> : <DashIcon className="h-4 w-4" />}
      </span>
      <span className={!included ? "opacity-80" : undefined}>{label}</span>
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
      className="scroll-mt-28 overflow-hidden rounded-[var(--flux-rad-lg)] border border-[var(--flux-primary-alpha-12)] bg-[rgba(34,31,58,0.4)] transition-colors hover:border-[var(--flux-primary-alpha-25)]"
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full cursor-pointer items-center justify-between gap-4 px-5 py-[18px] text-left font-display text-sm font-semibold text-[var(--flux-text)] transition-colors hover:text-[var(--flux-primary-light)]"
        aria-expanded={open}
      >
        <span>{question}</span>
        <span
          className="shrink-0 text-[var(--flux-text-muted)] transition-transform duration-300"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
        >
          <ChevronDownIcon className="h-[18px] w-[18px]" />
        </span>
      </button>
      {open ? (
        <div className="border-t border-[var(--flux-primary-alpha-10)] px-5 pb-[18px] pt-0 text-[13px] leading-[1.7] text-[var(--flux-text-muted)]">{answer}</div>
      ) : null}
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
