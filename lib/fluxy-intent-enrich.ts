import "server-only";

import type {
  FluxyClassifyContext,
  FluxyIntentKind,
  FluxyOmnibarResultItem,
} from "@/lib/fluxy-intent-types";

function stripLocalePrefix(pathname: string): string {
  return pathname.replace(/^\/(pt-BR|en)(?=\/|$)/, "") || "/";
}

export function extractBoardIdFromPath(pathname: string): string | null {
  const p = stripLocalePrefix(pathname);
  const m = p.match(/^\/board\/([^/?#]+)/);
  return m?.[1] ? decodeURIComponent(m[1]) : null;
}

function navResult(id: string, title: string, path: string): FluxyOmnibarResultItem {
  return { id, title, subtitle: path, action: { type: "navigate", path } };
}

/**
 * Turns a classified intent into concrete UI results (paths are **without** locale).
 */
export function enrichIntent(params: {
  intent: FluxyIntentKind;
  speech: string;
  context: FluxyClassifyContext;
  userText: string;
}): { speech: string; results: FluxyOmnibarResultItem[] } {
  const { intent, speech, context, userText } = params;
  const boardFromCtx = context.boardId?.trim() || extractBoardIdFromPath(context.pathname) || null;
  const qEnc = encodeURIComponent(userText.trim());

  switch (intent) {
    case "nav_boards":
      return {
        speech,
        results: [navResult("nav-boards", "Boards", "/boards")],
      };
    case "nav_portfolio":
      return {
        speech,
        results: [navResult("nav-portfolio", "Portfólio", "/portfolio")],
      };
    case "nav_routines":
      return {
        speech,
        results: [navResult("nav-routines", "Rotinas", "/routines")],
      };
    case "nav_equipe":
      return {
        speech,
        results: [navResult("nav-equipe", "Equipe", "/equipe?tab=membros")],
      };
    case "open_command_palette":
      return {
        speech,
        results: [
          {
            id: "cmd-palette",
            title: "Paleta de comandos",
            subtitle: "Atalhos e busca global",
            action: { type: "event", name: "flux-open-command-palette" },
          },
        ],
      };
    case "board_copilot":
      if (boardFromCtx) {
        return {
          speech,
          results: [
            {
              id: "board-copilot",
              title: "Copiloto deste board",
              subtitle: userText.slice(0, 80),
              action: { type: "navigate", path: `/board/${encodeURIComponent(boardFromCtx)}?copilot=1&q=${qEnc}` },
            },
          ],
        };
      }
      return {
        speech,
        results: [navResult("nav-boards", "Abrir um board primeiro", "/boards")],
      };
    case "board_nlq":
      if (boardFromCtx) {
        const seed = encodeURIComponent(`/query ${userText.trim()}`);
        return {
          speech,
          results: [
            {
              id: "board-nlq",
              title: "Consulta NLQ no copiloto",
              subtitle: userText.slice(0, 80),
              action: {
                type: "navigate",
                path: `/board/${encodeURIComponent(boardFromCtx)}?copilot=1&q=${seed}`,
              },
            },
          ],
        };
      }
      return {
        speech,
        results: [navResult("nav-boards", "Abrir um board para NLQ", "/boards")],
      };
    case "board_new_card":
      if (boardFromCtx) {
        return {
          speech,
          results: [
            {
              id: "board-new-card",
              title: "Novo card",
              subtitle: boardFromCtx,
              action: { type: "navigate", path: `/board/${encodeURIComponent(boardFromCtx)}?newCard=1` },
            },
          ],
        };
      }
      return {
        speech,
        results: [navResult("nav-boards", "Abrir um board para criar card", "/boards")],
      };
    default:
      return {
        speech: speech || "Navegação sugerida",
        results: [
          navResult("fallback-boards", "Boards", "/boards"),
          navResult("fallback-portfolio", "Portfólio", "/portfolio"),
        ],
      };
  }
}
