#!/usr/bin/env node
/**
 * Codemod incremental: normaliza alguns padrões de alpha legados em TSX/CSS.
 * Uso: `node scripts/migrate-alpha-tokens.mjs` (dry-run) | `node scripts/migrate-alpha-tokens.mjs --write`
 *
 * Mapeamento ampliável — alinhar com a tabela do épico Onda 4 antes de rodar em massa.
 */
import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const write = process.argv.includes("--write");

const REPLACEMENTS = [
  { from: "bg-[var(--flux-black-alpha-06)]", to: "bg-[color-mix(in_srgb,var(--flux-surface-dark)_94%,transparent)]" },
  { from: "bg-[var(--flux-black-alpha-04)]", to: "bg-[color-mix(in_srgb,var(--flux-surface-dark)_96%,transparent)]" },
];

async function walk(dir, acc = []) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    if (e.name === "node_modules" || e.name === ".next" || e.name === "coverage") continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) await walk(p, acc);
    else if (/\.(tsx|ts|jsx|js|css)$/.test(e.name)) acc.push(p);
  }
  return acc;
}

async function main() {
  const dirs = [path.join(root, "app"), path.join(root, "components"), path.join(root, "context")];
  let changed = 0;
  for (const d of dirs) {
    let files = [];
    try {
      files = await walk(d);
    } catch {
      continue;
    }
    for (const file of files) {
      let src = await fs.readFile(file, "utf8");
      let next = src;
      for (const { from, to } of REPLACEMENTS) {
        if (next.includes(from)) next = next.split(from).join(to);
      }
      if (next !== src) {
        changed++;
        if (write) await fs.writeFile(file, next, "utf8");
        else process.stdout.write(`[dry-run] would update ${path.relative(root, file)}\n`);
      }
    }
  }
  process.stdout.write(
    write ? `migrate-alpha-tokens: updated ${changed} file(s).\n` : `migrate-alpha-tokens: ${changed} file(s) need updates (use --write).\n`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
