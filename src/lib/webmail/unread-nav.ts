export const WEBMAIL_UNREAD_NAV_EVENT = "opuntia-webmail-unread";

export type WebmailUnreadNavDetail = {
  accountId?: string | null;
};

/** Aggiorna i numeri «non lette» in In arrivo / sidebar. */
export function notifyWebmailUnreadNav(accountId?: string | null) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<WebmailUnreadNavDetail>(WEBMAIL_UNREAD_NAV_EVENT, {
      detail: { accountId: accountId ?? null },
    })
  );
}
