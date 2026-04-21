import "server-only";

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * O pacote npm `pdfjs-dist` não publica os binários em `standard_fonts/` (só licenças).
 * Sem esses arquivos, o worker tenta ler fontes no disco e falha ao renderizar texto.
 * Fazemos cache em /tmp (ou equivalente) a partir do jsDelivr, alinhado à versão instalada.
 */
const STANDARD_FONT_FILES = [
  "FoxitDingbats.pfb",
  "FoxitFixed.pfb",
  "FoxitFixedBold.pfb",
  "FoxitFixedBoldItalic.pfb",
  "FoxitFixedItalic.pfb",
  "FoxitSerif.pfb",
  "FoxitSerifBold.pfb",
  "FoxitSerifBoldItalic.pfb",
  "FoxitSerifItalic.pfb",
  "FoxitSymbol.pfb",
  "LiberationSans-Bold.ttf",
  "LiberationSans-BoldItalic.ttf",
  "LiberationSans-Italic.ttf",
  "LiberationSans-Regular.ttf",
] as const;

function readPdfjsDistVersion(): string {
  try {
    const p = path.join(process.cwd(), "node_modules", "pdfjs-dist", "package.json");
    const j = JSON.parse(fs.readFileSync(p, "utf8")) as { version?: string };
    return String(j.version || "5.4.296");
  } catch {
    return "5.4.296";
  }
}

let fontsDirPromise: Promise<string> | null = null;

/**
 * Garante diretório absoluto `.../standard_fonts/` com barra final, para `standardFontDataUrl` do pdf.js (Node lê via fs).
 */
export function ensurePdfJsStandardFontsOnDisk(): Promise<string> {
  fontsDirPromise ??= downloadStandardFonts().catch((err) => {
    fontsDirPromise = null;
    throw err;
  });
  return fontsDirPromise;
}

async function downloadStandardFonts(): Promise<string> {
  const ver = readPdfjsDistVersion();
  const dir = path.join(os.tmpdir(), "flux-board-pdfjs", ver, "standard_fonts");
  const marker = path.join(dir, ".complete");
  if (fs.existsSync(marker)) {
    return dir + path.sep;
  }
  await fs.promises.mkdir(dir, { recursive: true });
  const base = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${ver}/standard_fonts/`;
  for (const name of STANDARD_FONT_FILES) {
    const dest = path.join(dir, name);
    if (fs.existsSync(dest) && fs.statSync(dest).size > 0) continue;
    const res = await fetch(`${base}${encodeURIComponent(name)}`);
    if (!res.ok) {
      throw new Error(`standard_fonts/${name}: HTTP ${res.status}`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    await fs.promises.writeFile(dest, buf);
  }
  await fs.promises.writeFile(marker, new Date().toISOString(), "utf8");
  return dir + path.sep;
}
