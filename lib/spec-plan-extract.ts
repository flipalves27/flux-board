import "server-only";

import path from "node:path";
import { pathToFileURL } from "node:url";

import mammoth from "mammoth";

/**
 * pdf.js (via pdf-parse) espera DOMMatrix / Path2D / ImageData no global em Node.
 * O polyfill interno do pdfjs usa `createRequire(import.meta.url)` a partir do bundle em
 * `node_modules/pdfjs-dist`, o que falha no Next — carregamos @napi-rs/canvas antes do import dinâmico.
 */
async function ensurePdfJsNodeGlobals(): Promise<void> {
  if (typeof globalThis.DOMMatrix !== "undefined") return;
  try {
    const canvas = await import("@napi-rs/canvas");
    const g = globalThis as unknown as Record<string, unknown>;
    if (!g.DOMMatrix && canvas.DOMMatrix) g.DOMMatrix = canvas.DOMMatrix as object;
    if (!g.Path2D && canvas.Path2D) g.Path2D = canvas.Path2D as object;
    if (!g.ImageData && canvas.ImageData) g.ImageData = canvas.ImageData as object;
  } catch (e) {
    console.error("[spec-plan-extract] @napi-rs/canvas (polyfill PDF no servidor)", e);
    throw new Error(
      `CANVAS_FOR_PDF: ${e instanceof Error ? e.message : String(e)}`
    );
  }
  if (typeof globalThis.DOMMatrix === "undefined") {
    throw new Error("DOMMatrix is not defined after @napi-rs/canvas load");
  }
}
import { SPEC_PLAN_MAX_FILE_BYTES } from "@/lib/spec-plan-constants";
import { ensurePdfJsStandardFontsOnDisk } from "@/lib/spec-plan-pdf-assets";
import { normalizeSpecDocumentText, truncateSpecText } from "@/lib/spec-plan-text-utils";

/** Opções para pdf.js em Node: cmaps locais, fontes padrão em cache (/tmp), OpenJPEG via JS (sem .wasm no pacote npm). */
async function buildPdfParseLoadOptions(data: Uint8Array): Promise<Record<string, unknown>> {
  const distRoot = path.join(process.cwd(), "node_modules", "pdfjs-dist");
  const distUrl = pathToFileURL(distRoot).href + "/";
  const wasmUrl = pathToFileURL(path.join(distRoot, "wasm")).href + "/";
  const standardFontDataUrl = await ensurePdfJsStandardFontsOnDisk();
  return {
    data,
    useSystemFonts: true,
    disableFontFace: true,
    isEvalSupported: false,
    useWasm: false,
    cMapUrl: `${distUrl}cmaps/`,
    cMapPacked: true,
    standardFontDataUrl,
    wasmUrl,
  };
}

export type SpecExtractResult = {
  text: string;
  kind: "pdf" | "docx" | "text";
  fileName: string;
  pageCount?: number;
  warnings: string[];
};

function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

/**
 * Extrai texto de PDF, DOCX ou usa texto colado diretamente.
 */
export async function extractSpecDocument(input: {
  buffer?: Buffer;
  fileName?: string;
  pastedText?: string;
}): Promise<SpecExtractResult> {
  const warnings: string[] = [];
  const pasted = typeof input.pastedText === "string" ? normalizeSpecDocumentText(input.pastedText) : "";

  if (input.buffer && input.buffer.length > SPEC_PLAN_MAX_FILE_BYTES) {
    throw new Error("FILE_TOO_LARGE");
  }

  if (!input.buffer || input.buffer.length === 0) {
    if (!pasted) {
      throw new Error("NO_INPUT");
    }
    const { text, truncated } = truncateSpecText(pasted);
    if (truncated) warnings.push("Texto colado foi truncado ao limite interno.");
    return { text, kind: "text", fileName: "pasted.txt", warnings };
  }

  const fileName = input.fileName || "upload";
  const ext = extOf(fileName);

  if (ext === "docx") {
    const r = await mammoth.extractRawText({ buffer: input.buffer });
    const raw = typeof r.value === "string" ? r.value : "";
    if (r.messages?.length) {
      for (const m of r.messages.slice(0, 5)) {
        if (m?.message) warnings.push(String(m.message));
      }
    }
    let combined = raw;
    if (pasted) {
      const extra = truncateSpecText(pasted, 24_000);
      combined = combined ? `${combined}\n\n--- Texto adicional colado ---\n\n${extra.text}` : extra.text;
    }
    const { text, truncated } = truncateSpecText(combined || "");
    if (!text) throw new Error("EMPTY_DOCUMENT");
    if (truncated) warnings.push("Documento truncado ao limite interno após extração.");
    return { text, kind: "docx", fileName, warnings };
  }

  if (ext === "pdf") {
    await ensurePdfJsNodeGlobals();
    const { PDFParse } = await import("pdf-parse");
    const workerAbs = path.join(
      process.cwd(),
      "node_modules",
      "pdfjs-dist",
      "legacy",
      "build",
      "pdf.worker.mjs"
    );
    PDFParse.setWorker(pathToFileURL(workerAbs).href);
    const data = new Uint8Array(input.buffer);
    let loadOpts: ConstructorParameters<typeof PDFParse>[0];
    try {
      loadOpts = (await buildPdfParseLoadOptions(data)) as ConstructorParameters<typeof PDFParse>[0];
    } catch (assetErr) {
      console.error("[spec-plan] PDF assets (fonts/wasm config) failed:", assetErr);
      const detail =
        assetErr instanceof Error ? assetErr.message : String(assetErr);
      throw new Error("PDF_EXTRACT_FAILED", { cause: `assets: ${detail}` });
    }
    const parser = new PDFParse(loadOpts);
    let raw = "";
    let pageCount: number | undefined;
    try {
      const textRes = await parser.getText();
      raw = typeof textRes.text === "string" ? textRes.text : "";
      pageCount = typeof textRes.total === "number" ? textRes.total : undefined;
    } catch (pdfErr) {
      console.error("[spec-plan] PDFParse.getText failed:", pdfErr);
      const detail =
        pdfErr instanceof Error
          ? pdfErr.message + (pdfErr.cause != null ? ` | cause: ${String(pdfErr.cause)}` : "")
          : String(pdfErr);
      throw new Error("PDF_EXTRACT_FAILED", { cause: detail });
    } finally {
      try {
        await parser.destroy();
      } catch {
        /* ignore */
      }
    }
    let combined = normalizeSpecDocumentText(raw);
    if (pasted) {
      const extra = truncateSpecText(pasted, 24_000);
      combined = combined ? `${combined}\n\n--- Texto adicional colado ---\n\n${extra.text}` : extra.text;
      if (!normalizeSpecDocumentText(raw)) {
        warnings.push("PDF sem camada de texto detectada; usando texto colado.");
      }
    }
    if (!combined) {
      warnings.push("Nenhum texto extraído do PDF (possível documento escaneado). Cole o texto manualmente ou use OCR externo.");
      throw new Error("EMPTY_DOCUMENT");
    }
    const { text, truncated } = truncateSpecText(combined);
    if (truncated) warnings.push("Documento truncado ao limite interno após extração.");
    return { text, kind: "pdf", fileName, pageCount, warnings };
  }

  throw new Error("UNSUPPORTED_TYPE");
}
