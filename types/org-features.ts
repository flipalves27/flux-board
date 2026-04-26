import type { Onda4UiFlags } from "@/lib/onda4-flags";
import type { UxV2Features } from "@/types/ux-v2-features";

/** Payload of `GET /api/org/features`. */
export type OrgFeaturesResponse = {
  lss_executive_reports: boolean;
  lss_ai_premium: boolean;
  board_copilot: boolean;
  spec_ai_scope_planner: boolean;
  board_pdf_list_import: boolean;
  /** Flux Docs + geração de documentos (incl. discovery externo com IA). */
  flux_docs: boolean;
  forge_oneshot: boolean;
  forge_tested: boolean;
  forge_autonomous: boolean;
  ui: {
    onda4: Onda4UiFlags;
    uxV2: UxV2Features;
  };
} & UxV2Features;
