import fs from "node:fs";
import path from "node:path";

function numEnv(name, fallback = null) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

const lighthouse = numEnv("UI_GATE_LIGHTHOUSE");
const cls = numEnv("UI_GATE_CLS");
const tti = numEnv("UI_GATE_TTI_MS");

const now = new Date().toISOString();
const outDir = path.join(process.cwd(), "docs", "reports");
const outPath = path.join(outDir, "ui-quality-gate-latest.md");
fs.mkdirSync(outDir, { recursive: true });

const md = `# UI Quality Gate Report

Generated at: ${now}

## Performance snapshot

- Lighthouse: ${lighthouse ?? "not provided"} (target >= 90)
- CLS: ${cls ?? "not provided"} (target < 0.1)
- TTI (ms): ${tti ?? "not provided"} (target: no relevant regression)

## Accessibility checklist

- [ ] Visible focus states validated
- [ ] Keyboard navigation validated
- [ ] AA contrast validated on affected surfaces
- [ ] Reduced motion behavior validated

## Visual regression checklist

- [ ] Before/after captures attached for affected components
- [ ] Dashboard overview / kanban / scrum / lss visual checks completed
- [ ] Empty/error states manually validated

## Smoke flows

- [ ] Drag card
- [ ] Open modal
- [ ] Open Copilot
`;

fs.writeFileSync(outPath, md, "utf8");
console.log(`UI quality gate report written to ${outPath}`);

