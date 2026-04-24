import "server-only";

import { extractSpecDocument } from "@/lib/spec-plan-extract";
import { SpecPlanMethodologySchema, type SpecPlanMethodology } from "@/lib/spec-plan-schemas";

export type SpecPlanFormParsed = {
  methodology: SpecPlanMethodology;
  remapOnly: boolean;
  documentText: string;
  extractMeta: { kind: string; fileName: string; pageCount?: number; warnings: string[] };
  workItemsJson: string;
};

export async function parseSpecPlanFormData(formData: FormData): Promise<Response | SpecPlanFormParsed> {
  const methodologyRaw = String(formData.get("methodology") || "").trim().toLowerCase();
  const methodologyParsed = SpecPlanMethodologySchema.safeParse(methodologyRaw);
  if (!methodologyParsed.success) {
    return new Response(JSON.stringify({ error: "Metodologia inválida (scrum, kanban, lss)." }), { status: 400 });
  }
  const methodology = methodologyParsed.data;

  const remapOnly = String(formData.get("remapOnly") || "") === "1" || String(formData.get("remapOnly") || "") === "true";
  const workItemsJsonField = formData.get("workItemsJson");
  const workItemsJson = typeof workItemsJsonField === "string" ? workItemsJsonField : "";

  const fileEntry = formData.get("file");
  const pastedText = String(formData.get("pastedText") || "").trim();

  let documentText = "";
  let extractMeta: SpecPlanFormParsed["extractMeta"] = {
    kind: "text",
    fileName: "remap",
    warnings: [],
  };

  if (!remapOnly) {
    let buffer: Buffer | undefined;
    let fileName = "spec";
    const isBlobLike =
      fileEntry &&
      typeof fileEntry === "object" &&
      typeof (fileEntry as Blob).arrayBuffer === "function" &&
      typeof (fileEntry as Blob).size === "number" &&
      (fileEntry as Blob).size > 0;
    if (isBlobLike) {
      const ab = await (fileEntry as Blob).arrayBuffer();
      buffer = Buffer.from(ab);
      fileName =
        fileEntry instanceof File && String(fileEntry.name || "").trim()
          ? String(fileEntry.name).trim()
          : "upload.pdf";
    }
    try {
      const extracted = await extractSpecDocument({ buffer, fileName, pastedText: pastedText || undefined });
      documentText = extracted.text;
      extractMeta = {
        kind: extracted.kind,
        fileName: extracted.fileName,
        pageCount: extracted.pageCount,
        warnings: extracted.warnings,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "extract_failed";
      console.error("[spec-plan-form-parse] extractSpecDocument", e);
      if (msg === "NO_INPUT") {
        return new Response(
          JSON.stringify({ error: "Envie um arquivo ou cole texto.", errorCode: "NO_INPUT" }),
          { status: 400 }
        );
      }
      if (msg === "FILE_TOO_LARGE") {
        return new Response(
          JSON.stringify({ error: "Arquivo acima do limite.", errorCode: "FILE_TOO_LARGE" }),
          { status: 400 }
        );
      }
      if (msg === "UNSUPPORTED_TYPE") {
        return new Response(
          JSON.stringify({ error: "Use PDF, DOCX ou texto colado.", errorCode: "UNSUPPORTED_TYPE" }),
          { status: 400 }
        );
      }
      if (msg === "EMPTY_DOCUMENT") {
        return new Response(
          JSON.stringify({
            error: "Não foi possível extrair texto. Cole o conteúdo manualmente ou use PDF com texto.",
            errorCode: "EMPTY_DOCUMENT",
          }),
          { status: 400 }
        );
      }
      if (msg === "PDF_EXTRACT_FAILED") {
        const cause =
          e instanceof Error && e.cause != null
            ? e.cause instanceof Error
              ? e.cause.message
              : String(e.cause)
            : undefined;
        return new Response(
          JSON.stringify({
            error:
              "Não foi possível processar o PDF no servidor (arquivo protegido, corrompido ou ambiente). Tente DOCX, outro PDF ou cole o texto da especificação.",
            errorCode: "PDF_EXTRACT_FAILED",
            cause,
          }),
          { status: 400 }
        );
      }
      return new Response(
        JSON.stringify({
          error: "Falha ao ler documento.",
          errorCode: "EXTRACT_UNKNOWN",
          cause: msg !== "extract_failed" ? msg : undefined,
        }),
        { status: 500 }
      );
    }
  } else {
    if (!workItemsJson.trim()) {
      return new Response(JSON.stringify({ error: "workItemsJson obrigatório para remapear." }), { status: 400 });
    }
  }

  return { methodology, remapOnly, documentText, extractMeta, workItemsJson };
}

export type BoardImportExtractMeta = {
  kind: string;
  fileName: string;
  pageCount?: number;
  warnings: string[];
};

export type BoardImportExtractResult =
  | { ok: true; documentText: string; extractMeta: BoardImportExtractMeta }
  | { ok: false; response: Response };

/**
 * Extração de PDF/DOCX/texto colado para importações no board (paridade com Spec, sem fase de metodologia).
 */
export async function tryExtractBoardImportDocument(formData: FormData): Promise<BoardImportExtractResult> {
  const fileEntry = formData.get("file");
  const pastedText = String(formData.get("pastedText") || "").trim();

  let documentText = "";
  let extractMeta: BoardImportExtractMeta = {
    kind: "text",
    fileName: "pasted",
    warnings: [],
  };

  let buffer: Buffer | undefined;
  let fileName = "import";
  const isBlobLike =
    fileEntry &&
    typeof fileEntry === "object" &&
    typeof (fileEntry as Blob).arrayBuffer === "function" &&
    typeof (fileEntry as Blob).size === "number" &&
    (fileEntry as Blob).size > 0;
  if (isBlobLike) {
    const ab = await (fileEntry as Blob).arrayBuffer();
    buffer = Buffer.from(ab);
    fileName =
      fileEntry instanceof File && String(fileEntry.name || "").trim()
        ? String(fileEntry.name).trim()
        : "upload.pdf";
  }
  try {
    const extracted = await extractSpecDocument({ buffer, fileName, pastedText: pastedText || undefined });
    documentText = extracted.text;
    extractMeta = {
      kind: extracted.kind,
      fileName: extracted.fileName,
      pageCount: extracted.pageCount,
      warnings: extracted.warnings,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "extract_failed";
    console.error("[board-import] extractSpecDocument", e);
    if (msg === "NO_INPUT") {
      return {
        ok: false,
        response: new Response(
          JSON.stringify({ error: "Envie um arquivo ou cole texto.", errorCode: "NO_INPUT" }),
          { status: 400 }
        ),
      };
    }
    if (msg === "FILE_TOO_LARGE") {
      return {
        ok: false,
        response: new Response(JSON.stringify({ error: "Arquivo acima do limite.", errorCode: "FILE_TOO_LARGE" }), {
          status: 400,
        }),
      };
    }
    if (msg === "UNSUPPORTED_TYPE") {
      return {
        ok: false,
        response: new Response(
          JSON.stringify({ error: "Use PDF, DOCX ou texto colado.", errorCode: "UNSUPPORTED_TYPE" }),
          { status: 400 }
        ),
      };
    }
    if (msg === "EMPTY_DOCUMENT") {
      return {
        ok: false,
        response: new Response(
          JSON.stringify({
            error: "Não foi possível extrair texto. Cole o conteúdo manualmente ou use PDF com texto.",
            errorCode: "EMPTY_DOCUMENT",
          }),
          { status: 400 }
        ),
      };
    }
    if (msg === "PDF_EXTRACT_FAILED") {
      const cause =
        e instanceof Error && e.cause != null
          ? e.cause instanceof Error
            ? e.cause.message
            : String(e.cause)
          : undefined;
      return {
        ok: false,
        response: new Response(
          JSON.stringify({
            error:
              "Não foi possível processar o PDF no servidor (arquivo protegido, corrompido ou ambiente). Tente DOCX, outro PDF ou cole o texto.",
            errorCode: "PDF_EXTRACT_FAILED",
            cause,
          }),
          { status: 400 }
        ),
      };
    }
    return {
      ok: false,
      response: new Response(
        JSON.stringify({
          error: "Falha ao ler documento.",
          errorCode: "EXTRACT_UNKNOWN",
          cause: msg !== "extract_failed" ? msg : undefined,
        }),
        { status: 500 }
      ),
    };
  }

  return { ok: true, documentText, extractMeta };
}
