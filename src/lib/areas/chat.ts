import {
  firstNavLeafPath,
  resolveNavPage,
  type NavItem,
} from "@/lib/areas/nav-tree";

/**
 * Skeleton menu Chat (Opzione A).
 * Gli elenchi dinamici (argomenti / chat 1:1) sono popolati in ChatSidebarNav.
 */
export const CHAT_SECTIONS: readonly NavItem[] = [
  {
    slug: "argomenti",
    label: "Per argomento",
    description: "Chat di gruppo per topic",
    path: "/app/chat/argomenti",
    children: [
      {
        slug: "nuovo",
        label: "+ Nuovo Argomento",
        description: "Crea un argomento e invita i membri",
        path: "/app/chat/argomenti/nuovo",
      },
      {
        slug: "elenco",
        label: "Elenco Argomenti",
        description: "Argomenti attivi a cui partecipi",
        path: "/app/chat/argomenti/elenco",
        children: [],
      },
    ],
  },
  {
    slug: "dirette",
    label: "Fra utenti",
    description: "Chat personali uno a uno",
    path: "/app/chat/dirette",
    children: [
      {
        slug: "nuova",
        label: "+ Nuova chat",
        description: "Avvia una chat con un collega",
        path: "/app/chat/dirette/nuova",
      },
      {
        slug: "elenco",
        label: "Elenco chat",
        description: "Chat 1:1 attive",
        path: "/app/chat/dirette/elenco",
        children: [],
      },
    ],
  },
] as const;

export function getFirstChatPath(): string {
  return "/app/chat/argomenti/nuovo";
}

export function resolveChatPage(segments: string[]) {
  return resolveNavPage(CHAT_SECTIONS, segments);
}
