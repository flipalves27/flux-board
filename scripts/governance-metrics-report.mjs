import fs from "node:fs";
import path from "node:path";

const now = new Date().toISOString();
const outDir = path.join(process.cwd(), "docs", "reports");
const outPath = path.join(outDir, "governance-weekly-latest.md");
fs.mkdirSync(outDir, { recursive: true });

function readEnv(name, fallback = "n/a") {
  const v = process.env[name];
  return v && String(v).trim() ? String(v).trim() : fallback;
}

const md = `# Governance Weekly Dashboard

Generated at: ${now}

## Wave status

- Onda 0: ${readEnv("WAVE0_STATUS", "on_track")}
- Onda 1: ${readEnv("WAVE1_STATUS", "on_track")}
- Onda 2: ${readEnv("WAVE2_STATUS", "on_track")}
- Onda 3: ${readEnv("WAVE3_STATUS", "on_track")}

## Engineering

- PR lead time p50: ${readEnv("ENG_PR_LEADTIME_P50", "n/a")}
- PR lead time p90: ${readEnv("ENG_PR_LEADTIME_P90", "n/a")}
- Rollback rate: ${readEnv("ENG_ROLLBACK_RATE", "n/a")}
- Coverage total: ${readEnv("ENG_COVERAGE_TOTAL", "n/a")}

## Product and UX

- Lighthouse core: ${readEnv("UX_LIGHTHOUSE_CORE", "n/a")}
- CLS global: ${readEnv("UX_CLS_GLOBAL", "n/a")}
- Sprint lifecycle success rate: ${readEnv("UX_SPRINT_FLOW_SUCCESS", "n/a")}
- Copilot open success rate: ${readEnv("UX_COPILOT_OPEN_SUCCESS", "n/a")}

## Competitiveness

- Boards with Git integration active: ${readEnv("COMP_GIT_ACTIVE_BOARDS", "n/a")}
- Active Public API tokens: ${readEnv("COMP_PUBLIC_API_ACTIVE_TOKENS", "n/a")}
- Daily valid Public API requests: ${readEnv("COMP_PUBLIC_API_REQ_PER_DAY", "n/a")}
- PWA installs: ${readEnv("COMP_PWA_INSTALLS", "n/a")}
- Active automations/org: ${readEnv("COMP_AUTOMATIONS_PER_ORG", "n/a")}
`;

fs.writeFileSync(outPath, md, "utf8");
console.log(`Governance report written to ${outPath}`);

