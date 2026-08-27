/**
 * Scroll iniziale chat: fondo se gli unread stanno in viewport,
 * altrimenti allinea il primo non letto in alto nel box messaggi.
 */
export function scrollChatListInitial(opts: {
  container: HTMLElement;
  firstUnreadEl: HTMLElement | null;
}): void {
  const { container, firstUnreadEl } = opts;

  if (!firstUnreadEl) {
    container.scrollTop = container.scrollHeight;
    return;
  }

  const cRect = container.getBoundingClientRect();
  const uRect = firstUnreadEl.getBoundingClientRect();
  const offset = uRect.top - cRect.top + container.scrollTop;
  const remaining = container.scrollHeight - offset;

  if (remaining <= container.clientHeight + 8) {
    container.scrollTop = container.scrollHeight;
  } else {
    container.scrollTop = Math.max(0, offset);
  }
}

export function findFirstUnreadMessageId<
  T extends { id: string; senderId: string; isRead: boolean },
>(messages: T[], userId: string): string | null {
  const hit = messages.find((m) => m.senderId !== userId && !m.isRead);
  return hit?.id ?? null;
}
