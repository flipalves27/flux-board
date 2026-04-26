#!/usr/bin/env node
/**
 * Minimal external worker stub: poll GET /api/forge/worker/next?orgId=...
 * Configure FLUX_FORGE_WORKER_SECRET and FLUX_BOARD_ORIGIN (e.g. https://app.example.com).
 */
const origin = process.env.FLUX_BOARD_ORIGIN?.replace(/\/+$/, "") || "http://localhost:3000";
const secret = process.env.FLUX_FORGE_WORKER_SECRET?.trim();
const orgId = process.env.FLUX_FORGE_WORKER_ORG_ID?.trim();

if (!secret || !orgId) {
  console.error("Set FLUX_FORGE_WORKER_SECRET and FLUX_FORGE_WORKER_ORG_ID");
  process.exit(1);
}

async function tick() {
  const r = await fetch(`${origin}/api/forge/worker/next?orgId=${encodeURIComponent(orgId)}`, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  const j = await r.json();
  if (j.job) {
    console.log("[forge-worker] job", j.job._id, j.job.status);
    /* In production: checkout repo, run sandbox, PATCH job status via authenticated API */
  } else {
    console.log("[forge-worker] idle");
  }
}

setInterval(() => {
  tick().catch((e) => console.error(e));
}, 15_000);
void tick();
