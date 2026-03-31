import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const pkgPath = path.join(root, "package.json");
const outDir = path.join(root, "docs", "reports");
const outPath = path.join(outDir, "quality-gate-latest.md");

function checkScript(scripts, name) {
  return typeof scripts?.[name] === "string" && scripts[name].trim().length > 0;
}

async function main() {
  const pkgRaw = await fs.readFile(pkgPath, "utf8");
  const pkg = JSON.parse(pkgRaw);
  const scripts = pkg.scripts ?? {};

  const checks = [
    { id: "lint", ok: checkScript(scripts, "lint"), note: "Lint command configured" },
    { id: "test", ok: checkScript(scripts, "test"), note: "Unit test command configured" },
    { id: "build", ok: checkScript(scripts, "build"), note: "Build command configured" },
    { id: "test:e2e", ok: checkScript(scripts, "test:e2e"), note: "E2E smoke command configured" },
    { id: "test:coverage", ok: checkScript(scripts, "test:coverage"), note: "Coverage command configured" },
  ];

  const passed = checks.filter((c) => c.ok).length;
  const status = passed === checks.length ? "on_track" : passed >= checks.length - 1 ? "at_risk" : "off_track";
  const now = new Date().toISOString();

  const md = [
    "# Quality Gate Report",
    "",
    `- Generated at: \`${now}\``,
    `- Status: \`${status}\``,
    "",
    "## Checks",
    "",
    ...checks.map((c) => `- [${c.ok ? "x" : " "}] \`${c.id}\` - ${c.note}`),
    "",
    "## Next Actions",
    "",
    "- Run `npm run lint`",
    "- Run `npm run test`",
    "- Run `npm run test:e2e`",
  ].join("\n");

  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(outPath, md, "utf8");
  process.stdout.write(`Quality gate report written to ${path.relative(root, outPath)}\n`);
}

main().catch((e) => {
  console.error("[quality-gate-report] failed", e);
  process.exit(1);
});

