/**
 * Scroll iniziale chat: fondo se gli unread stanno in viewport,
 * altrimenti allinea il primo non letto in alto nel box messaggi.
 */

/** Porta lo scroll al massimo basso (ripetuto per layout async / anteprime). */
export function pinChatListToBottom(
  container: HTMLElement,
  settleMs = 1800
): () => void {
  const pin = () => {
    container.scrollTop = container.scrollHeight;
  };

  pin();
  const raf1 = requestAnimationFrame(() => {
    pin();
    requestAnimationFrame(pin);
  });

  const ro = new ResizeObserver(() => pin());
  ro.observe(container);
  for (const child of Array.from(container.children)) {
    if (child instanceof HTMLElement) ro.observe(child);
  }

  const onLoad = () => pin();
  container.addEventListener("load", onLoad, true);

  const timer = window.setTimeout(() => {
    ro.disconnect();
    container.removeEventListener("load", onLoad, true);
  }, settleMs);

  return () => {
    cancelAnimationFrame(raf1);
    window.clearTimeout(timer);
    ro.disconnect();
    container.removeEventListener("load", onLoad, true);
  };
}

export function scrollChatListInitial(opts: {
  container: HTMLElement;
  firstUnreadEl: HTMLElement | null;
}): (() => void) | void {
  const { container, firstUnreadEl } = opts;

  if (!firstUnreadEl) {
    return pinChatListToBottom(container);
  }

  const cRect = container.getBoundingClientRect();
  const uRect = firstUnreadEl.getBoundingClientRect();
  const offset = uRect.top - cRect.top + container.scrollTop;
  const remaining = container.scrollHeight - offset;

  if (remaining <= container.clientHeight + 8) {
    return pinChatListToBottom(container);
  }

  container.scrollTop = Math.max(0, offset);
}

export function findFirstUnreadMessageId<
  T extends { id: string; senderId: string; isRead: boolean },
>(messages: T[], userId: string): string | null {
  const hit = messages.find((m) => m.senderId !== userId && !m.isRead);
  return hit?.id ?? null;
}
