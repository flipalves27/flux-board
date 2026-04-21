/**
 * Run Lighthouse against a local URL (start `npm run start` first).
 * Usage: LIGHTHOUSE_URL=http://127.0.0.1:3000/pt-BR/boards npm run lighthouse:local
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { launch } from "chrome-launcher";
import lighthouse from "lighthouse";

const __dirname = dirname(fileURLToPath(import.meta.url));
const url = process.env.LIGHTHOUSE_URL ?? "http://127.0.0.1:3000/pt-BR/login";

async function main() {
  const chrome = await launch({ chromeFlags: ["--headless=new", "--no-sandbox"] });
  try {
    const options = {
      logLevel: "error",
      output: "json",
      onlyCategories: ["performance"],
      port: chrome.port,
    };
    const runnerResult = await lighthouse(url, options);
    const lhr = runnerResult?.lhr;
    if (!lhr) {
      console.error("Lighthouse did not return a report.");
      process.exitCode = 1;
      return;
    }

    const outDir = join(__dirname, "..", ".lighthouse");
    mkdirSync(outDir, { recursive: true });
    const outPath = join(outDir, "report.json");
    writeFileSync(outPath, JSON.stringify(lhr, null, 2));

    const perf = lhr.categories?.performance?.score;
    const fcp = lhr.audits["first-contentful-paint"]?.numericValue;
    const lcp = lhr.audits["largest-contentful-paint"]?.numericValue;
    const tbt = lhr.audits["total-blocking-time"]?.numericValue;
    const cls = lhr.audits["cumulative-layout-shift"]?.numericValue;

    console.log(JSON.stringify({ url, reportPath: outPath, performanceScore: perf, fcpMs: fcp, lcpMs: lcp, tbtMs: tbt, cls }, null, 2));
  } finally {
    await chrome.kill();
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
