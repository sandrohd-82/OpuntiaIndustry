import {
  firstNavLeafPath,
  resolveNavPage,
  type NavItem,
} from "@/lib/areas/nav-tree";

/** Menu Chat — messaggistica utente↔utente */
export const CHAT_SECTIONS: readonly NavItem[] = [
  {
    slug: "inbox",
    label: "Inbox",
    description: "Conversazioni personali",
    path: "/app/chat/inbox",
    badge: { kind: "count", count: 0 },
  },
  {
    slug: "nuova",
    label: "+ Nuova chat",
    description: "Avvia conversazione con un utente",
    path: "/app/chat/nuova",
  },
  {
    slug: "rubrica",
    label: "Rubrica",
    description: "Contatti con interazioni recenti",
    path: "/app/chat/rubrica",
  },
] as const;

export function getFirstChatPath(): string {
  return firstNavLeafPath(CHAT_SECTIONS);
}

export function resolveChatPage(segments: string[]) {
  return resolveNavPage(CHAT_SECTIONS, segments);
}
