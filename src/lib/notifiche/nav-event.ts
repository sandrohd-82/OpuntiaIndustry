export const NOTIFICHE_NAV_EVENT = "opuntia-notifiche-nav";

export function notifyNotificheNav() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(NOTIFICHE_NAV_EVENT));
}
