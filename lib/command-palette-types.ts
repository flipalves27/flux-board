export type PaletteCategory = "history" | "boards" | "cards" | "actions" | "navigation";

export type PaletteAction =
  | { type: "navigate"; path: string }
  | { type: "board"; boardId: string }
  | { type: "card"; boardId: string; cardId: string }
  | { type: "newCard"; boardId: string }
  | { type: "newBoard" }
  | { type: "copilot"; boardId: string }
  | { type: "boardDeep"; boardId: string; query: string };

export type PaletteItem = {
  id: string;
  category: PaletteCategory;
  title: string;
  subtitle?: string;
  keywords: string;
  action: PaletteAction;
  icon?: "boards" | "cards" | "actions" | "navigation" | "history";
};

export type HistoryPaletteEntry = {
  id: string;
  category: PaletteCategory;
  title: string;
  subtitle?: string;
  action: PaletteAction;
};
