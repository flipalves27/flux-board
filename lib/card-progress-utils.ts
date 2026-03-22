const DONE_PROGRESS = new Set(["Concluída", "Done", "Closed", "Cancelada"]);

export function isCardProgressDone(progress: unknown): boolean {
  return DONE_PROGRESS.has(String(progress ?? ""));
}
