/**
 * True when the user is likely typing in a field — global shortcuts should not fire.
 * Matches WAI-ARIA patterns for text input and combobox.
 */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof Element)) return false;
  const el = target as HTMLElement;
  if (el.isContentEditable) return true;
  const ce = el.getAttribute("contenteditable");
  if (ce === "true" || ce === "" || ce === "plaintext-only") return true;
  const tag = el.tagName;
  if (tag === "TEXTAREA") return true;
  if (tag === "SELECT") return true;
  if (tag === "INPUT") {
    const type = (el as HTMLInputElement).type?.toLowerCase() ?? "text";
    if (type === "button" || type === "submit" || type === "reset" || type === "checkbox" || type === "radio") {
      return false;
    }
    return true;
  }
  const role = el.getAttribute("role");
  if (role === "textbox" || role === "combobox" || role === "searchbox") return true;
  return false;
}
