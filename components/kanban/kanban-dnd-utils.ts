export function parseSlotId(id: string): { bucketKey: string; index: number } | null {
  if (!id.startsWith("slot-")) return null;
  const rest = id.slice(5);
  const lastDash = rest.lastIndexOf("-");
  if (lastDash === -1) return null;
  const bucketKey = rest.slice(0, lastDash);
  const index = parseInt(rest.slice(lastDash + 1), 10);
  if (isNaN(index) || index < 0) return null;
  return { bucketKey, index };
}
