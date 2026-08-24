import {
  firstNavLeafPath,
  resolveNavPage,
  type NavItem,
} from "@/lib/areas/nav-tree";

function branch(
  tipo: "processo" | "materia_prima",
  slug: string,
  label: string,
  description: string
): NavItem {
  const base = `/app/ricerca-sviluppo/${slug}`;
  return {
    slug,
    label,
    description,
    path: base,
    children: [
      {
        slug: "nuova",
        label: "+ Nuova Ricerca",
        description: `Crea una nuova ricerca — ${label}`,
        path: `${base}/nuova`,
      },
      {
        slug: "elenco",
        label: "Elenco ricerche",
        description: `Ricerche attive — ${label}`,
        path: `${base}/elenco`,
      },
      {
        slug: "archivio",
        label: "Archivio",
        description: `Ricerche archiviate — ${label}`,
        path: `${base}/archivio`,
      },
    ],
  };
}

/** Menu Ricerca e sviluppo */
export const RICERCA_SVILUPPO_SECTIONS: readonly NavItem[] = [
  branch(
    "processo",
    "ricerche-processi",
    "Ricerche processi",
    "Timeline ricerche sui processi"
  ),
  branch(
    "materia_prima",
    "ricerche-materie-prime",
    "Ricerche Materie Prime",
    "Timeline ricerche sulle materie prime"
  ),
  {
    slug: "archivio-ricerche-scientifiche",
    label: "Archivio Ricerche Scientifiche",
    description:
      "Archivio unificato di tutte le ricerche scientifiche (processi e materie prime)",
    path: "/app/ricerca-sviluppo/archivio-ricerche-scientifiche",
  },
] as const;

export function getFirstRicercaSviluppoPath(): string {
  return firstNavLeafPath(RICERCA_SVILUPPO_SECTIONS);
}

export function resolveRicercaSviluppoPage(segments: string[]) {
  return resolveNavPage(RICERCA_SVILUPPO_SECTIONS, segments);
}

export function sezioneToTipo(
  section: string
): "processo" | "materia_prima" | null {
  if (section === "ricerche-processi") return "processo";
  if (section === "ricerche-materie-prime") return "materia_prima";
  return null;
}
