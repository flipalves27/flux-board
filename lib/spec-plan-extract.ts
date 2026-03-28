import "server-only";

import mammoth from "mammoth";
import { SPEC_PLAN_MAX_FILE_BYTES } from "@/lib/spec-plan-constants";
import { normalizeSpecDocumentText, truncateSpecText } from "@/lib/spec-plan-text-utils";

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
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: new Uint8Array(input.buffer) });
    let raw = "";
    let pageCount: number | undefined;
    try {
      const textRes = await parser.getText();
      raw = typeof textRes.text === "string" ? textRes.text : "";
      pageCount = typeof textRes.total === "number" ? textRes.total : undefined;
    } finally {
      await parser.destroy();
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
