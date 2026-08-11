/** Qualsiasi modale figlia sopra sync / scheda azienda. */
export function hasNestedModalOpen(): boolean {
  if (typeof document === "undefined") return false;
  return Boolean(document.querySelector("[data-nested-modal]"));
}
