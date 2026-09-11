export const ORDINI_DA_PROCESSARE_NAV_EVENT = "opuntia-ordini-da-processare";

/** Aggiorna il badge «Da processare» in sidebar. */
export function notifyOrdiniDaProcessareNav() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(ORDINI_DA_PROCESSARE_NAV_EVENT));
}
