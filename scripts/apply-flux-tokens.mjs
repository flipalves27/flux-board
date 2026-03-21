/**
 * One-shot migrator: replaces raw color literals in TS/TSX with var(--flux-*).
 * Run: node scripts/apply-flux-tokens.mjs
 * Order: longest matches first.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const EXT = new Set([".tsx", ".ts"]);
const SKIP_DIRS = new Set(["node_modules", ".next", "dist"]);

const REPLACEMENTS = [
  // Complex shadows / gradients (longest first)
  [
    "shadow-[0_0_0_1px_rgba(255,255,255,0.04)_inset,0_32px_96px_-24px_rgba(0,0,0,0.65),0_0_120px_-40px_rgba(108,92,231,0.35)]",
    "shadow-[var(--flux-shadow-modal-depth)]",
  ],
  [
    "shadow-[0_12px_32px_rgba(108,92,231,0.18)]",
    "shadow-[var(--flux-shadow-primary-panel)]",
  ],
  [
    "shadow-[0_10px_30px_rgba(0,0,0,0.2)]",
    "shadow-[var(--flux-shadow-elevated-card)]",
  ],
  [
    "shadow-[0_10px_30px_rgba(0,0,0,0.25)]",
    "shadow-[var(--flux-shadow-toast)]",
  ],
  [
    "shadow-[0_10px_30px_rgba(0,0,0,0.3)]",
    "shadow-[var(--flux-shadow-toast-strong)]",
  ],
  [
    "shadow-[0_10px_26px_-10px_rgba(108,92,231,0.55)]",
    "shadow-[var(--flux-shadow-copilot-bubble)]",
  ],
  [
    "shadow-[0_8px_20px_rgba(108,92,231,0.35)]",
    "shadow-[var(--flux-shadow-primary-medium)]",
  ],
  [
    "shadow-[0_1px_6px_rgba(108,92,231,0.35)]",
    "shadow-[var(--flux-shadow-primary-soft)]",
  ],
  [
    "shadow-[0_0_0_1px_rgba(0,210,211,0.12)]",
    "shadow-[var(--flux-shadow-secondary-outline)]",
  ],
  [
    "shadow-[0_0_10px_rgba(108,92,231,0.6)]",
    "shadow-[var(--flux-shadow-primary-dot)]",
  ],
  [
    "shadow-[0_0_8px_rgba(108,92,231,0.6)]",
    "shadow-[var(--flux-shadow-primary-dot-sm)]",
  ],
  [
    "shadow-[0_0_0_1px_rgba(255,255,255,0.04)_inset]",
    "shadow-[var(--flux-shadow-inset-hairline)]",
  ],
  [
    "shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]",
    "shadow-[var(--flux-shadow-inset-panel-top)]",
  ],
  [
    "shadow-[inset_0_1px_0_0_rgba(255,255,255,0.07),0_16px_48px_-20px_rgba(0,0,0,0.5)]",
    "shadow-[var(--flux-shadow-panel-hover)]",
  ],
  [
    "bg-[linear-gradient(148deg,rgba(255,255,255,0.05)_0%,rgba(255,255,255,0.02)_45%,rgba(0,0,0,0.08)_100%)]",
    "bg-[var(--flux-gradient-panel-sheen)]",
  ],
  [
    "linear-gradient(135deg, rgba(108,92,231,0.35), rgba(0,210,211,0.2), rgba(253,167,223,0.25))",
    "var(--flux-gradient-landing-cta)",
  ],
  // rgba primary 108,92,231
  ["rgba(108,92,231,0.50)", "var(--flux-primary-alpha-50)"],
  ["rgba(108,92,231,0.45)", "var(--flux-primary-alpha-45)"],
  ["rgba(108,92,231,0.38)", "var(--flux-primary-alpha-38)"],
  ["rgba(108,92,231,0.4)", "var(--flux-primary-alpha-40)"],
  ["rgba(108,92,231,0.40)", "var(--flux-primary-alpha-40)"],
  ["rgba(108,92,231,0.55)", "var(--flux-primary-alpha-55)"],
  ["rgba(108,92,231,0.03)", "var(--flux-primary-alpha-03)"],
  ["rgba(108,92,231,0.05)", "var(--flux-primary-alpha-05)"],
  ["rgba(108,92,231,0.35)", "var(--flux-primary-alpha-35)"],
  ["rgba(108,92,231,0.30)", "var(--flux-primary-alpha-30)"],
  ["rgba(108,92,231,0.28)", "var(--flux-primary-alpha-28)"],
  ["rgba(108,92,231,0.26)", "var(--flux-primary-alpha-26)"],
  ["rgba(108,92,231,0.25)", "var(--flux-primary-alpha-25)"],
  ["rgba(108,92,231,0.24)", "var(--flux-primary-alpha-24)"],
  ["rgba(108,92,231,0.22)", "var(--flux-primary-alpha-22)"],
  ["rgba(108,92,231,0.20)", "var(--flux-primary-alpha-20)"],
  ["rgba(108,92,231,0.2)", "var(--flux-primary-alpha-20)"],
  ["rgba(108,92,231,0.18)", "var(--flux-primary-alpha-18)"],
  ["rgba(108,92,231,0.16)", "var(--flux-primary-alpha-16)"],
  ["rgba(108,92,231,0.15)", "var(--flux-primary-alpha-15)"],
  ["rgba(108,92,231,0.14)", "var(--flux-primary-alpha-14)"],
  ["rgba(108,92,231,0.13)", "var(--flux-primary-alpha-13)"],
  ["rgba(108,92,231,0.12)", "var(--flux-primary-alpha-12)"],
  ["rgba(108,92,231,0.11)", "var(--flux-primary-alpha-11)"],
  ["rgba(108,92,231,0.10)", "var(--flux-primary-alpha-10)"],
  ["rgba(108,92,231,0.1)", "var(--flux-primary-alpha-10)"],
  ["rgba(108,92,231,0.08)", "var(--flux-primary-alpha-08)"],
  ["rgba(108,92,231,0.07)", "var(--flux-primary-alpha-07)"],
  ["rgba(108,92,231,0.06)", "var(--flux-primary-alpha-06)"],
  // secondary cyan
  ["rgba(0,210,211,0.38)", "var(--flux-secondary-alpha-38)"],
  ["rgba(0,210,211,0.35)", "var(--flux-secondary-alpha-35)"],
  ["rgba(0,210,211,0.32)", "var(--flux-secondary-alpha-32)"],
  ["rgba(0,210,211,0.28)", "var(--flux-secondary-alpha-28)"],
  ["rgba(0,210,211,0.25)", "var(--flux-secondary-alpha-25)"],
  ["rgba(0,210,211,0.22)", "var(--flux-secondary-alpha-22)"],
  ["rgba(0,210,211,0.21)", "var(--flux-secondary-alpha-21)"],
  ["rgba(0,210,211,0.14)", "var(--flux-secondary-alpha-14)"],
  ["rgba(0,210,211,0.12)", "var(--flux-secondary-alpha-12)"],
  ["rgba(0,210,211,0.10)", "var(--flux-secondary-alpha-10)"],
  ["rgba(0,210,211,0.1)", "var(--flux-secondary-alpha-10)"],
  ["rgba(0,210,211,0.09)", "var(--flux-secondary-alpha-09)"],
  ["rgba(0,210,211,0.08)", "var(--flux-secondary-alpha-08)"],
  ["rgba(0,210,211,0.07)", "var(--flux-secondary-alpha-07)"],
  ["rgba(0,210,211,0.55)", "var(--flux-secondary-alpha-55)"],
  ["rgba(0,210,211,0.8)", "var(--flux-secondary-alpha-80)"],
  ["rgba(0,210,211,0.18)", "var(--flux-secondary-alpha-18)"],
  ["rgba(0,210,211,0.06)", "var(--flux-secondary-alpha-06)"],
  // Neutral chrome tints (white on dark, ink on light — see TOKENS.md)
  ["rgba(255,255,255,0.20)", "var(--flux-chrome-alpha-20)"],
  ["rgba(255,255,255,0.18)", "var(--flux-chrome-alpha-18)"],
  ["rgba(255,255,255,0.16)", "var(--flux-chrome-alpha-16)"],
  ["rgba(255,255,255,0.14)", "var(--flux-chrome-alpha-14)"],
  ["rgba(255,255,255,0.12)", "var(--flux-chrome-alpha-12)"],
  ["rgba(255,255,255,0.10)", "var(--flux-chrome-alpha-10)"],
  ["rgba(255,255,255,0.1)", "var(--flux-chrome-alpha-10)"],
  ["rgba(255,255,255,0.09)", "var(--flux-chrome-alpha-09)"],
  ["rgba(255,255,255,0.08)", "var(--flux-chrome-alpha-08)"],
  ["rgba(255,255,255,0.07)", "var(--flux-chrome-alpha-07)"],
  ["rgba(255,255,255,0.06)", "var(--flux-chrome-alpha-06)"],
  ["rgba(255,255,255,0.05)", "var(--flux-chrome-alpha-05)"],
  ["rgba(255,255,255,0.04)", "var(--flux-chrome-alpha-04)"],
  ["rgba(255,255,255,0.03)", "var(--flux-chrome-alpha-03)"],
  ["rgba(255,255,255,0.9)", "var(--flux-chrome-alpha-90)"],
  ["rgba(255,255,255,0.8)", "var(--flux-chrome-alpha-80)"],
  ["rgba(255,255,255,0.3)", "var(--flux-chrome-alpha-30)"],
  // black overlays
  ["rgba(0,0,0,0.65)", "var(--flux-black-alpha-65)"],
  ["rgba(0,0,0,0.50)", "var(--flux-black-alpha-50)"],
  ["rgba(0,0,0,0.45)", "var(--flux-black-alpha-45)"],
  ["rgba(0,0,0,0.20)", "var(--flux-black-alpha-20)"],
  ["rgba(0,0,0,0.15)", "var(--flux-black-alpha-15)"],
  ["rgba(0,0,0,0.12)", "var(--flux-black-alpha-12)"],
  ["rgba(0,0,0,0.10)", "var(--flux-black-alpha-10)"],
  ["rgba(0,0,0,0.1)", "var(--flux-black-alpha-10)"],
  ["rgba(0,0,0,0.08)", "var(--flux-black-alpha-08)"],
  // danger / info / warning / success variants
  ["rgba(255,107,107,0.35)", "var(--flux-danger-alpha-35)"],
  ["rgba(255,107,107,0.30)", "var(--flux-danger-alpha-30)"],
  ["rgba(255,107,107,0.3)", "var(--flux-danger-alpha-30)"],
  ["rgba(255,107,107,0.2)", "var(--flux-danger-alpha-20)"],
  ["rgba(255,107,107,0.12)", "var(--flux-danger-alpha-12)"],
  ["rgba(255,107,107,0.06)", "var(--flux-danger-alpha-06)"],
  ["rgba(255,107,107,0.08)", "var(--flux-danger-alpha-08)"],
  ["rgba(255,107,107,0.15)", "var(--flux-danger-alpha-15)"],
  ["rgba(255,107,107,0.24)", "var(--flux-danger-alpha-24)"],
  ["rgba(255,107,107,0.26)", "var(--flux-danger-alpha-26)"],
  ["rgba(255,107,107,0.38)", "var(--flux-danger-alpha-38)"],
  ["rgba(255,107,107,0.40)", "var(--flux-danger-alpha-40)"],
  ["rgba(255,107,107,0.4)", "var(--flux-danger-alpha-40)"],
  ["rgba(255,107,107,0.45)", "var(--flux-danger-alpha-45)"],
  ["rgba(255,107,107,0.55)", "var(--flux-danger-alpha-55)"],
  ["rgba(255,80,80,0.06)", "var(--flux-danger-soft-06)"],
  ["rgba(116,185,255,0.35)", "var(--flux-info-alpha-35)"],
  ["rgba(116,185,255,0.30)", "var(--flux-info-alpha-30)"],
  ["rgba(116,185,255,0.3)", "var(--flux-info-alpha-30)"],
  ["rgba(116,185,255,0.12)", "var(--flux-info-alpha-12)"],
  ["rgba(116,185,255,0.10)", "var(--flux-info-alpha-10)"],
  ["rgba(116,185,255,0.1)", "var(--flux-info-alpha-10)"],
  ["rgba(116,185,255,0.22)", "var(--flux-info-alpha-22)"],
  ["rgba(116,185,255,0.38)", "var(--flux-info-alpha-38)"],
  ["rgba(253,167,223,0.8)", "var(--flux-accent-alpha-80)"],
  ["rgba(253,167,223,0.18)", "var(--flux-accent-alpha-18)"],
  ["rgba(253,167,223,0.14)", "var(--flux-accent-alpha-14)"],
  ["rgba(253,167,223,0.15)", "var(--flux-accent-alpha-15)"],
  ["rgba(253,167,223,0.2)", "var(--flux-accent-alpha-20)"],
  ["rgba(253,167,223,0.35)", "var(--flux-accent-alpha-35)"],
  ["rgba(255,217,61,0.9)", "var(--flux-warning-alpha-90)"],
  ["rgba(255,217,61,0.30)", "var(--flux-warning-alpha-30)"],
  ["rgba(255,217,61,0.3)", "var(--flux-warning-alpha-30)"],
  ["rgba(255,217,61,0.12)", "var(--flux-warning-alpha-12)"],
  ["rgba(255,217,61,0.10)", "var(--flux-warning-alpha-10)"],
  ["rgba(255,217,61,0.25)", "var(--flux-warning-alpha-25)"],
  ["rgba(255,217,61,0.35)", "var(--flux-warning-alpha-35)"],
  ["rgba(255,217,61,0.40)", "var(--flux-warning-alpha-40)"],
  ["rgba(255,217,61,0.4)", "var(--flux-warning-alpha-40)"],
  ["rgba(245,158,11,0.12)", "var(--flux-amber-alpha-12)"],
  ["rgba(245,158,11,0.28)", "var(--flux-amber-alpha-28)"],
  ["rgba(245,158,11,0.45)", "var(--flux-amber-alpha-45)"],
  ["rgba(255,215,0,0.48)", "var(--flux-gold-alpha-48)"],
  ["rgba(255,215,0,0.25)", "var(--flux-gold-alpha-25)"],
  ["rgba(255,215,0,0.15)", "var(--flux-gold-alpha-15)"],
  ["rgba(255,215,0,0.12)", "var(--flux-gold-alpha-12)"],
  ["rgba(255,215,0,0.10)", "var(--flux-gold-alpha-10)"],
  ["rgba(255,215,0,0.1)", "var(--flux-gold-alpha-10)"],
  ["rgba(255,215,0,0.5)", "var(--flux-gold-alpha-50)"],
  ["rgba(255,215,0,0.35)", "var(--flux-gold-alpha-35)"],
  ["rgba(255,215,0,0.08)", "var(--flux-gold-alpha-08)"],
  ["rgba(0,230,118,0.45)", "var(--flux-success-alpha-45)"],
  ["rgba(0,230,118,0.40)", "var(--flux-success-alpha-40)"],
  ["rgba(0,230,118,0.4)", "var(--flux-success-alpha-40)"],
  ["rgba(0,230,118,0.35)", "var(--flux-success-alpha-35)"],
  ["rgba(0,230,118,0.30)", "var(--flux-success-alpha-30)"],
  ["rgba(0,230,118,0.3)", "var(--flux-success-alpha-30)"],
  ["rgba(0,230,118,0.12)", "var(--flux-success-alpha-12)"],
  ["rgba(0,230,118,0.10)", "var(--flux-success-alpha-10)"],
  ["rgba(0,230,118,0.08)", "var(--flux-success-alpha-08)"],
  ["rgba(0,230,118,0.1)", "var(--flux-success-alpha-10)"],
  ["rgba(0,201,183,0.45)", "var(--flux-teal-alpha-45)"],
  ["rgba(0,201,183,0.35)", "var(--flux-teal-alpha-35)"],
  ["rgba(0,201,183,0.12)", "var(--flux-teal-alpha-12)"],
  ["rgba(0,201,183,0.10)", "var(--flux-teal-alpha-10)"],
  ["rgba(0,201,183,0.08)", "var(--flux-teal-alpha-08)"],
  ["rgba(16,185,129,0.35)", "var(--flux-emerald-alpha-35)"],
  ["rgba(16,185,129,0.12)", "var(--flux-emerald-alpha-12)"],
  ["rgba(38,222,129,0.35)", "var(--flux-reports-heat-low)"],
  // portal chrome
  ["rgba(155,151,194,0.35)", "var(--flux-portal-chrome-35)"],
  ["rgba(155,151,194,0.25)", "var(--flux-portal-chrome-25)"],
  ["rgba(155,151,194,0.18)", "var(--flux-portal-chrome-18)"],
  ["rgba(155,151,194,0.15)", "var(--flux-portal-chrome-15)"],
  ["rgba(155,151,194,0.12)", "var(--flux-portal-chrome-12)"],
  ["rgba(155,151,194,0.10)", "var(--flux-portal-chrome-10)"],
  ["rgba(155,151,194,0.1)", "var(--flux-portal-chrome-10)"],
  ["rgba(155,151,194,0.2)", "var(--flux-portal-chrome-20)"],
  ["rgba(13,11,26,0.36)", "var(--flux-void-nested-36)"],
  ["rgba(34,31,58,0.85)", "var(--flux-surface-card-deep-85)"],
  ["rgba(13,148,136,0.12)", "var(--flux-mapa-teal-12)"],
  ["rgba(13,148,136,0.14)", "var(--flux-mapa-teal-14)"],
  ["rgba(13,148,136,0.35)", "var(--flux-mapa-teal-35)"],
  ["rgba(13,148,136,0.4)", "var(--flux-mapa-teal-40)"],
  ["rgba(79,70,229,0.1)", "var(--flux-mapa-indigo-10)"],
  ["rgba(79,70,229,0.12)", "var(--flux-mapa-indigo-12)"],
  ["rgba(79,70,229,0.35)", "var(--flux-mapa-indigo-35)"],
  ["rgba(185,28,28,0.1)", "var(--flux-mapa-red-10)"],
  ["rgba(185,28,28,0.12)", "var(--flux-mapa-red-12)"],
  ["rgba(185,28,28,0.35)", "var(--flux-mapa-red-35)"],
  ["rgba(185,28,28,0.4)", "var(--flux-mapa-red-40)"],
  ["border-[rgba(249,115,115,0.55)]", "border-[var(--flux-error-input-ring)]"],
  // hex text accents → semantic
  ["#F97373", "var(--flux-danger-bright)"],
  ["#EF4444", "var(--flux-danger-accent)"],
  ["#F59E0B", "var(--flux-warning-foreground)"],
  ["#74B9FF", "var(--flux-info)"],
  ["#009E90", "var(--flux-teal-foreground)"],
  ["#0D9488", "var(--flux-mapa-text-teal)"],
  ["#4F46E5", "var(--flux-mapa-text-indigo)"],
  ["#B91C1C", "var(--flux-mapa-text-red)"],
  ["#00C9B7", "var(--flux-teal-brand)"],
  ["#00E676", "var(--flux-success)"],
  ["#059669", "var(--flux-success-solid-dark)"],
  ["#1A1730", "var(--flux-ink-on-bright)"],
  ["#6c5ce7", "var(--flux-primary)"],
  ["#00d2d3", "var(--flux-secondary)"],
  ["#f59e0b", "var(--flux-warning-foreground)"],
  ["#ff6b6b", "var(--flux-danger)"],
  ["#a29bfe", "var(--flux-primary-light)"],
  ["#26de81", "var(--flux-success)"],
  ["#fd79a8", "var(--flux-accent-dark)"],
  ["#74b9ff", "var(--flux-info)"],
  // default primary fallbacks (portal)
  ['"#6C5CE7"', '"var(--flux-primary)"'],
  ['"#00D2D3"', '"var(--flux-secondary)"'],
  ["0 2px 8px rgba(108,92,231,0.25)", "var(--flux-shadow-logo-underlay)"],
];

const TAILWIND_SLASH = [
  ["bg-black/50", "bg-[var(--flux-backdrop-scrim-strong)]"],
  ["bg-black/40", "bg-[var(--flux-backdrop-scrim)]"],
  ["bg-black/20", "bg-[var(--flux-black-alpha-20)]"],
  ["bg-black/10", "bg-[var(--flux-black-alpha-10)]"],
  ["border-white/8", "border-[var(--flux-chrome-alpha-08)]"],
];

function* walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    if (e.name.startsWith(".")) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      yield* walk(p);
    } else if (EXT.has(path.extname(e.name))) {
      yield p;
    }
  }
}

let changed = 0;
for (const dir of ["app", "components", "context"]) {
  const base = path.join(ROOT, dir);
  if (!fs.existsSync(base)) continue;
  for (const file of walk(base)) {
    let s = fs.readFileSync(file, "utf8");
    const orig = s;
    for (const [a, b] of REPLACEMENTS) {
      if (a === b) continue;
      s = s.split(a).join(b);
    }
    for (const [a, b] of TAILWIND_SLASH) {
      s = s.split(a).join(b);
    }
    if (s !== orig) {
      fs.writeFileSync(file, s);
      changed++;
    }
  }
}
console.log(`Updated ${changed} files.`);
