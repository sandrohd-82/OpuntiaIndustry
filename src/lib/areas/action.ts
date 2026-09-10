import {
  firstNavLeafPath,
  resolveNavPage,
  type NavItem,
} from "@/lib/areas/nav-tree";

/** Menu Action — IoT (placeholder; moduli in costruzione). */
export const ACTION_SECTIONS: readonly NavItem[] = [
  {
    slug: "aree",
    label: "Aree",
    description: "Aree operative di motori, essiccatori, macchine e impianti",
    path: "/app/action/aree",
    children: [
      {
        slug: "essiccatori",
        label: "Essiccatori",
        description: "Impianti e comandi area essiccatori",
        path: "/app/action/aree/essiccatori",
      },
      {
        slug: "taglio",
        label: "Taglio",
        description: "Impianti e comandi area taglio",
        path: "/app/action/aree/taglio",
      },
      {
        slug: "triturazione",
        label: "Triturazione",
        description: "Impianti e comandi area triturazione",
        path: "/app/action/aree/triturazione",
      },
    ],
  },
  {
    slug: "sensori",
    label: "Sensori",
    description: "Telemetria e stato dei dispositivi",
    path: "/app/action/sensori",
  },
  {
    slug: "azioni",
    label: "Azioni",
    description: "Comandi immediati o programmati sui dispositivi",
    path: "/app/action/azioni",
  },
  {
    slug: "programmi",
    label: "Programmi",
    description: "Insiemi di azioni da eseguire in sequenza",
    path: "/app/action/programmi",
  },
] as const;

export function getFirstActionPath(): string {
  return firstNavLeafPath(ACTION_SECTIONS);
}

export function resolveActionPage(segments: string[]) {
  return resolveNavPage(ACTION_SECTIONS, segments);
}
