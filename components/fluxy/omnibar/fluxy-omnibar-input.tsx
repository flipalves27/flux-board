"use client";

export function FluxyOmnibarInput(props: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  value: string;
  onChange: (v: string) => void;
  onClose: () => void;
  busy: boolean;
  reducedMotion: boolean;
}) {
  const { inputRef, value, onChange, onClose, busy, reducedMotion } = props;
  return (
    <div className="flex items-start gap-2">
      <input
        ref={inputRef}
        value={value}
        disabled={busy}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Pergunte ou navegue: boards, portfólio, copiloto, novo card…"
        aria-busy={busy}
        className={`mt-1 w-full rounded-[var(--flux-rad)] border border-[var(--flux-border-muted)] bg-[var(--flux-surface-card)] px-3 py-2 text-sm text-[var(--flux-text)] outline-none focus:border-[var(--flux-primary)] ${reducedMotion ? "" : "transition-colors duration-150"}`}
      />
      <button
        type="button"
        className="mt-1 shrink-0 rounded-[var(--flux-rad)] border border-[var(--flux-border-muted)] px-2 py-2 text-[var(--flux-text-muted)] hover:bg-[var(--flux-surface-hover)] md:hidden"
        aria-label="Fechar"
        onClick={onClose}
      >
        ✕
      </button>
    </div>
  );
}
