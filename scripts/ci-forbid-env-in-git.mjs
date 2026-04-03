#!/usr/bin/env node
/**
 * Falha o CI se ficheiros sensíveis (.env.local, etc.) estiverem no índice Git
 * ou se padrões óbvios de segredo aparecerem em ficheiros rastreados.
 *
 * Uso: node scripts/ci-forbid-env-in-git.mjs
 */
import { execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");

/** Caminhos (relativos) que nunca devem ser commitados. */
const FORBIDDEN_PATH_PREFIXES = [
  ".env.local",
  ".env.production",
  ".env.production.local",
  ".env.development.local",
  ".env.test.local",
];

/** Regex sobre caminhos normalizados (forward slashes). */
function isForbiddenPath(rel) {
  const n = rel.replace(/\\/g, "/").replace(/^\.\//, "");
  return FORBIDDEN_PATH_PREFIXES.some(
    (p) => n === p || n.startsWith(`${p}/`) || n.includes(`/${p}`) || n.endsWith(`/${p}`)
  );
}

function gitLsFiles() {
  try {
    return execSync("git ls-files", { cwd: ROOT, encoding: "utf8" })
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
  } catch {
    console.error("[ci-forbid-env] Não foi possível executar `git ls-files`.");
    process.exit(1);
    return [];
  }
}

/** Linhas que sugerem segredos colados em ficheiros de código (heurística conservadora). */
const SECRET_LINE_PATTERNS = [
  /^\s*JWT_SECRET\s*=\s*.+/i,
  /^\s*RATE_LIMIT_INTERNAL_SECRET\s*=\s*.+/i,
  /^\s*STRIPE_SECRET_KEY\s*=\s*sk_live/i,
  /^\s*NEXT_PUBLIC_VERCEL_BYPASS_SECRET\s*=\s*.+/i,
];

const ALLOWLIST_FILES = new Set([
  "scripts/ci-forbid-env-in-git.mjs",
  "lib/env-validate.test.ts",
  "lib/jwt-secret.test.ts",
]);

function scanTrackedForSecretLines(files) {
  const hits = [];
  for (const rel of files) {
    if (!/\.(mjs|cjs|js|ts|tsx|json|md|yml|yaml)$/i.test(rel)) continue;
    if (ALLOWLIST_FILES.has(rel.replace(/\\/g, "/"))) continue;
    const abs = resolve(ROOT, rel);
    if (!existsSync(abs)) continue;
    let content;
    try {
      content = readFileSync(abs, "utf8");
    } catch {
      continue;
    }
    const lines = content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const rx of SECRET_LINE_PATTERNS) {
        if (rx.test(line) && !line.includes("placeholder") && !line.includes("vitest-jwt")) {
          hits.push({ rel, line: i + 1, preview: line.slice(0, 120) });
        }
      }
    }
  }
  return hits;
}

const tracked = gitLsFiles();
const badPaths = tracked.filter(isForbiddenPath);
if (badPaths.length) {
  console.error("[ci-forbid-env] Ficheiros/paths proibidos no repositório:");
  for (const p of badPaths) console.error(`  - ${p}`);
  process.exit(1);
}

const secretHits = scanTrackedForSecretLines(tracked);
if (secretHits.length) {
  console.error("[ci-forbid-env] Possíveis atribuições de segredo em ficheiros rastreados:");
  for (const h of secretHits) console.error(`  - ${h.rel}:${h.line} ${h.preview}`);
  process.exit(1);
}

console.log("[ci-forbid-env] OK — sem .env sensível nem padrões de segredo óbvios no tree Git.");
