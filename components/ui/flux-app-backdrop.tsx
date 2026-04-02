/**
 * Same decorative layers as {@link AppShell}: subtle aurora blobs + dense grid.
 * Use inside a `relative` full-bleed container; keep foreground content in `relative z-[1]` or above.
 */
export function FluxAppBackdrop({ className = "z-0" }: { className?: string }) {
  return (
    <div className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`} aria-hidden>
      <div className="flux-aurora-bg flux-aurora-bg--subtle absolute inset-0">
        <span className="flux-aurora-blob flux-aurora-blob--a" />
        <span className="flux-aurora-blob flux-aurora-blob--b" />
        <span className="flux-aurora-blob flux-aurora-blob--c" />
      </div>
      <div className="flux-grid-overlay flux-grid-overlay--dense absolute inset-0 opacity-[0.22]" />
    </div>
  );
}
