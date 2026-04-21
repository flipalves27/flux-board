#!/usr/bin/env node
/**
 * Gate de regressão: termos de demo vertical que não devem voltar ao código.
 * Uso: node scripts/ci-forbid-banned-terms.mjs
 */
import { execSync } from "node:child_process";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");

function main() {
  try {
    execSync(`git grep -n -E "austral|Austral" -- . ":!scripts/ci-forbid-banned-terms.mjs"`, {
      cwd: ROOT,
      encoding: "utf8",
      stdio: "pipe",
    });
    console.error("[ci-forbid-banned-terms] Termos banidos encontrados (austral / Austral).");
    process.exit(1);
  } catch (e) {
    if (e.status === 1) {
      console.log("[ci-forbid-banned-terms] OK — nenhuma ocorrência.");
      return;
    }
    throw e;
  }
}

main();
