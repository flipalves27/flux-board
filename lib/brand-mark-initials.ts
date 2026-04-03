/** Iniciais para o selo “FB” (duas primeiras palavras ou dois primeiros caracteres alfanuméricos). */
export function brandMarkInitials(name: string): string {
  const words = name.split(/[^a-zA-Z0-9]+/).filter(Boolean);
  if (words.length >= 2) {
    const a = words[0]![0];
    const b = words[1]![0];
    if (a && b) return `${a}${b}`.toUpperCase();
  }
  const compact = name.replace(/[^a-zA-Z0-9]/g, "");
  if (compact.length >= 2) return compact.slice(0, 2).toUpperCase();
  if (compact.length === 1) return (compact + compact).toUpperCase();
  return "FB";
}
