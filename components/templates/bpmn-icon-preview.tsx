import { BPMN_VISUAL_SPEC, BPMN_VISUAL_TOKENS, getBpmnVisualSpec } from "@/lib/bpmn-visual-system";
import { renderBpmnIcon } from "@/lib/bpmn-icon-render";

function shapeClass(type: string): string {
  const { shape } = getBpmnVisualSpec(type);
  if (shape === "diamond") return "rotate-45 rounded-[4px]";
  if (shape === "circle") return "rounded-full";
  if (shape === "document") return "rounded-[2px]";
  return "rounded-[var(--flux-rad)]";
}

function isRotatedShape(type: string): boolean {
  return getBpmnVisualSpec(type).shape === "diamond";
}

function colorWithAlpha(hex: string, alpha: number): string {
  const normalized = hex.replace("#", "");
  if (normalized.length !== 6) return hex;
  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function BpmnIconPreview() {
  return (
    <section className="rounded-[var(--flux-rad-xl)] border border-[var(--flux-primary-alpha-20)] bg-[var(--flux-surface-card)] p-5 space-y-3">
      <div>
        <h3 className="font-display font-semibold text-[var(--flux-text)]">Preview de ícones BPMN</h3>
        <p className="text-xs text-[var(--flux-text-muted)]">A grade usa o mesmo util de ícones do canvas (`renderBpmnIcon`) para manter paridade visual.</p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
        {BPMN_VISUAL_SPEC.map((spec) => {
          const color = BPMN_VISUAL_TOKENS.semanticPalette[spec.colorToken as keyof typeof BPMN_VISUAL_TOKENS.semanticPalette];
          return (
            <div key={spec.type} className="rounded-[var(--flux-rad)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-dark)]/35 p-2.5">
              <div className="flex items-center gap-2">
                <span
                  className={`relative inline-flex h-9 w-9 items-center justify-center border ${shapeClass(spec.type)}`}
                  style={{
                    borderStyle: spec.borderStyle === "double" ? "double" : "solid",
                    borderWidth: spec.borderStyle === "thick" ? BPMN_VISUAL_TOKENS.strokeEmphasis : BPMN_VISUAL_TOKENS.stroke,
                    borderColor: colorWithAlpha(color, 0.8),
                    backgroundColor: colorWithAlpha(color, 0.2),
                  }}
                >
                  {spec.borderStyle === "double" && spec.shape === "circle" ? <span className="absolute inset-[4px] rounded-full border border-white/40" aria-hidden /> : null}
                  <span className={`${isRotatedShape(spec.type) ? "-rotate-45" : ""} text-white`} style={{ width: BPMN_VISUAL_TOKENS.iconSize, height: BPMN_VISUAL_TOKENS.iconSize }}>
                    {renderBpmnIcon(spec.icon)}
                  </span>
                </span>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold text-[var(--flux-text)] truncate">{spec.type}</p>
                  <p className="text-[10px] text-[var(--flux-text-muted)] truncate">{spec.category}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
