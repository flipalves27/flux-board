#!/usr/bin/env node
/**
 * Pentest leve: npm audit + avisos estáticos (dangerouslySetInnerHTML, rotas API).
 * Uso: node scripts/security-audit.mjs
 */
import { execSync } from "node:child_process";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
let exit = 0;

console.log("=== npm audit (production) ===\n");
try {
  execSync("npm audit --omit=dev", { cwd: root, stdio: "inherit" });
} catch {
  exit = 1;
}

console.log("\n=== dangerouslySetInnerHTML (revisar manualmente) ===\n");
function walk(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, name.name);
    if (name.isDirectory()) {
      if (name.name === "node_modules" || name.name === ".next" || name.name === "coverage") continue;
      walk(p, acc);
    } else if (/\.(tsx|jsx)$/.test(name.name)) {
      acc.push(p);
    }
  }
  return acc;
}

const hits = [];
for (const f of walk(join(root, "app")).concat(walk(join(root, "components")))) {
  const s = readFileSync(f, "utf8");
  if (s.includes("dangerouslySetInnerHTML")) hits.push(f.slice(root.length + 1));
}
if (hits.length) console.log(hits.join("\n"));
else console.log("(nenhum)");

console.log("\n=== Rotas API (contagem) ===\n");
const apiRoot = join(root, "app", "api");
let routeCount = 0;
function countRoutes(dir) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, name.name);
    if (name.isDirectory()) countRoutes(p);
    else if (name.name === "route.ts") routeCount++;
  }
}
countRoutes(apiRoot);
console.log(`route.ts encontrados: ${routeCount}`);
console.log("\nConcluído. Ver docs/flux-security-threat-model.md para STRIDE.\n");
process.exit(exit);
