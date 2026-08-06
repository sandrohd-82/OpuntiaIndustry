import {
  firstNavLeafPath,
  resolveNavPage,
  type NavItem,
} from "@/lib/areas/nav-tree";

/** Sottosezioni del modulo Commerciale (menu laterale) */
export const COMMERCIALE_SECTIONS: readonly NavItem[] = [
  {
    slug: "clienti-con-storico",
    label: "Clienti con storico",
    description: "Clienti con storico commerciale",
    path: "/app/commerciale/clienti-con-storico",
    children: [
      {
        slug: "elenco",
        label: "Elenco",
        description: "Elenco clienti con storico",
        path: "/app/commerciale/clienti-con-storico/elenco",
      },
    ],
  },
  {
    slug: "clienti-contattati",
    label: "Clienti contattati",
    description: "Clienti contattati",
    path: "/app/commerciale/clienti-contattati",
    children: [
      {
        slug: "elenco",
        label: "Elenco",
        description: "Elenco clienti contattati",
        path: "/app/commerciale/clienti-contattati/elenco",
      },
    ],
  },
] as const;

export function getFirstCommercialePath(): string {
  return firstNavLeafPath(COMMERCIALE_SECTIONS);
}

export function resolveCommercialePage(segments: string[]) {
  return resolveNavPage(COMMERCIALE_SECTIONS, segments);
}
