import {
  firstNavLeafPath,
  resolveNavPage,
  type NavItem,
} from "@/lib/areas/nav-tree";

function trio(
  slug: string,
  label: string,
  description: string,
  nuovaLabel: string
): NavItem {
  const base = `/app/promemorie-e-note/${slug}`;
  return {
    slug,
    label,
    description,
    path: base,
    children: [
      {
        slug: "nuova",
        label: nuovaLabel,
        description: `Crea ${label.toLowerCase()}`,
        path: `${base}/nuova`,
      },
      {
        slug: "elenco",
        label: `Elenco ${label}`,
        description: `Tutti gli elementi organizzati per data/ora`,
        path: `${base}/elenco`,
      },
      {
        slug: "calendario",
        label: `Calendario ${label}`,
        description: `Calendario con elenco ${label.toLowerCase()}`,
        path: `${base}/calendario`,
      },
    ],
  };
}

/** Menu Promemorie e note (tra Chat e Area Fiscale) */
export const PROMEMORIE_E_NOTE_SECTIONS: readonly NavItem[] = [
  trio(
    "promemoria",
    "Promemoria",
    "Alert semplici (es. Chiamare X)",
    "+ Nuovo Promemoria"
  ),
  trio(
    "attivita",
    "Attività",
    "Attività con @utenti, luoghi, descrizione e data/ora",
    "+ Nuova Attività"
  ),
  trio(
    "note",
    "Note",
    "Note tipo post-it collegabili alle anagrafiche",
    "+ Nuova Note"
  ),
] as const;

export function getFirstPromemorieENotePath(): string {
  return firstNavLeafPath(PROMEMORIE_E_NOTE_SECTIONS);
}

export function resolvePromemorieENotePage(segments: string[]) {
  return resolveNavPage(PROMEMORIE_E_NOTE_SECTIONS, segments);
}
