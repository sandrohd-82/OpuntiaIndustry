import {
  firstNavLeafPath,
  resolveNavPage,
  type NavItem,
} from "@/lib/areas/nav-tree";

/** Menu Chat — argomenti collaborativi */
export const CHAT_SECTIONS: readonly NavItem[] = [
  {
    slug: "nuovo-argomento",
    label: "+ Nuovo Argomento",
    description: "Crea un nuovo argomento di discussione",
    path: "/app/chat/nuovo-argomento",
  },
  {
    slug: "elenco-argomenti",
    label: "Elenco argomenti",
    description: "Argomenti aperti (es. incontri, fiere)",
    path: "/app/chat/elenco-argomenti",
  },
  {
    slug: "argomenti-archiviati",
    label: "Argomenti archiviati",
    description: "Argomenti chiusi o archiviati",
    path: "/app/chat/argomenti-archiviati",
  },
] as const;

export function getFirstChatPath(): string {
  return firstNavLeafPath(CHAT_SECTIONS);
}

export function resolveChatPage(segments: string[]) {
  return resolveNavPage(CHAT_SECTIONS, segments);
}
