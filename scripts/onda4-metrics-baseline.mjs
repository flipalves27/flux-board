import fs from "node:fs/promises";
import path from "node:path";

/**
 * Baseline de métricas Onda 4 (pré-mudanças de UI).
 * Não executa Lighthouse/analyzer aqui — documenta comandos e campos de auditoria.
 */
const root = process.cwd();
const outDir = path.join(root, "docs", "reports");
const outPath = path.join(outDir, "onda4-metrics-baseline.md");

async function main() {
  const now = new Date().toISOString();
  const md = [
    "# Onda 4 — baseline de métricas",
    "",
    `- Gerado em: \`${now}\``,
    "",
    "## AI usage (`ai_usage_log` Mongo)",
    "",
    "- Coleção: \`ai_usage_log\`",
    "- Campos: \`orgId\`, \`feature\`, \`model\`, \`inputTokens\`, \`outputTokens\`, \`estimatedCostUsd\`, \`createdAt\`",
    "- Features novas Onda 4: prefixar com \`onda4_\` ou reutilizar nomes existentes (ex.: \`board_executive_brief_ai\`, \`board_intake\`, \`board_flow_signal\`) para agregação.",
    "",
    "## Bundle",
    "",
    "- Rodar: \`npm run analyze:bundle\` (webpack bundle analyzer no build).",
    "- Comparar artefatos `.next` / relatório do analyzer após mudanças no board.",
    "",
    "## Lighthouse",
    "",
    "- Rodar: \`npm run lighthouse:local\` (script existente em \`scripts/lighthouse-local.mjs\`).",
    "- Alvo prioritário: \`/portfolio\` e landing \`/pt-BR\`.",
    "",
    "## Feature flags",
    "",
    "- Org: \`Organization.ui.onda4\` — ver \`lib/onda4-flags.ts\`.",
    "- Ambiente: \`FLUX_ONDA4_DEFAULT_ENABLED\` (default \`0\` em produção).",
    "",
  ].join("\n");

  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(outPath, md, "utf8");
  process.stdout.write(`Onda 4 metrics baseline written to ${path.relative(root, outPath)}\n`);
}

main().catch((e) => {
  console.error("[onda4-metrics-baseline]", e);
  process.exit(1);
});
