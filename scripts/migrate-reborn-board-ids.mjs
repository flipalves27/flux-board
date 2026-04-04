#!/usr/bin/env node
/**
 * @deprecated Use `npm run migrate:legacy-board-ids` (scripts/migrate-legacy-board-ids.mjs).
 * Mantido para compatibilidade com runbooks e CI legados.
 */
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const target = resolve(import.meta.dirname, "migrate-legacy-board-ids.mjs");
const r = spawnSync(process.execPath, [target], { stdio: "inherit" });
process.exit(r.status ?? 1);
