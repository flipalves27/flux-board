const CARD_ID_PATTERN = /^ID(\d{4,})$/i;

export function parseCardSequence(cardId: string): number | null {
  const match = CARD_ID_PATTERN.exec(String(cardId || "").trim());
  if (!match) return null;
  const sequence = Number.parseInt(match[1], 10);
  if (!Number.isFinite(sequence) || sequence < 1) return null;
  return sequence;
}

export function formatCardSequence(sequence: number): string {
  const safeSequence = Number.isFinite(sequence) && sequence > 0 ? Math.floor(sequence) : 1;
  return `ID${String(safeSequence).padStart(4, "0")}`;
}

export function nextBoardCardId(existingIds: Iterable<string>): string {
  let maxSequence = 0;
  const used = new Set<string>();

  for (const rawId of existingIds) {
    const id = String(rawId || "").trim().toUpperCase();
    if (!id) continue;
    used.add(id);
    const sequence = parseCardSequence(id);
    if (sequence && sequence > maxSequence) {
      maxSequence = sequence;
    }
  }

  let nextSequence = maxSequence + 1;
  let candidate = formatCardSequence(nextSequence);
  while (used.has(candidate)) {
    nextSequence += 1;
    candidate = formatCardSequence(nextSequence);
  }
  return candidate;
}
