type DailyOpener = () => void;

let registeredOpener: DailyOpener | null = null;

/** KanbanBoard registers the real opener (resets Daily state); the desktop tools rail invokes it. */
export function registerBoardDesktopDailyOpener(fn: DailyOpener | null) {
  registeredOpener = fn;
}

export function openBoardDesktopDaily() {
  registeredOpener?.();
}
