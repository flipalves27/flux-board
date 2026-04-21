#!/usr/bin/env node
/**
 * Consolida sombras legadas para tokens semânticos em `app/globals.css`.
 * Uso: `node scripts/migrate-shadow-tokens.mjs` | `node scripts/migrate-shadow-tokens.mjs --write`
 */
import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const write = process.argv.includes("--write");

const REPLACEMENTS = [
  { from: "shadow-[0_10px_30px_rgba(0,0,0,0.35)]", to: "shadow-[var(--flux-shadow-elevated-card)]" },
];

async function walk(dir, acc = []) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    if (e.name === "node_modules" || e.name === ".next") continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) await walk(p, acc);
    else if (/\.(tsx|ts|jsx|js)$/.test(e.name)) acc.push(p);
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
    write ? `migrate-shadow-tokens: updated ${changed} file(s).\n` : `migrate-shadow-tokens: ${changed} file(s) (use --write).\n`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
