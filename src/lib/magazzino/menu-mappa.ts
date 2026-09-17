import { z } from "zod";
import {
  AREA_ROUTES,
  SIDEBAR_AREA_ORDER,
  SIDEBAR_HIDDEN_AREAS,
} from "@/lib/areas/config";
import { MAGAZZINO_SECTIONS } from "@/lib/areas/magazzino";
import { PRODUZIONE_SECTIONS } from "@/lib/areas/produzione";
import { AMMINISTRAZIONE_SECTIONS } from "@/lib/areas/amministrazione";
import { COMMERCIALE_SECTIONS } from "@/lib/areas/commerciale";
import { ACTION_SECTIONS } from "@/lib/areas/action";
import { STRUMENTI_SECTIONS } from "@/lib/areas/strumenti";
import { AREA_FISCALE_SECTIONS } from "@/lib/areas/area-fiscale";
import { PROMEMORIE_E_NOTE_SECTIONS } from "@/lib/areas/promemorie-e-note";
import { AREA_FORNITORI_SECTIONS } from "@/lib/areas/area-fornitori";
import { RICERCA_SVILUPPO_SECTIONS } from "@/lib/areas/ricerca-sviluppo";
import { firstLeafPath, isNavBranch, type NavItem } from "@/lib/areas/nav-tree";
import type { AreaSlug } from "@/types/database";

export const MAPPA_MENU_NAV_EVENT = "opuntia-mappa-menu-updated";

/** Seme Magazzino > Mappa Magazzino: non si elimina in soft delete. */
export const MAPPA_MENU_SEED_MAPPA_ID = "11111111-1111-4111-8111-111111111111";

export const MAPPA_MENU_TIPI = ["ramo", "luogo"] as const;
export type MappaMenuTipo = (typeof MAPPA_MENU_TIPI)[number];

export type MappaMenuNodo = {
  id: string;
  parentId: string | null;
  areaSlug: string;
  etichetta: string;
  slug: string;
  tipo: MappaMenuTipo;
};

export type MappaMenuFogliaNav = {
  nodoId: string;
  slug: string;
  luogoNome: string;
  vistaEtichetta: string;
};

export type MappaMenuOpzione = {
  id: string;
  etichetta: string;
  slug: string;
  tipo: MappaMenuTipo | "statico";
  virtuale?: boolean;
};

export function areePrimoLivelloMappa(): { slug: AreaSlug; label: string }[] {
  return SIDEBAR_AREA_ORDER.filter(
    (s) =>
      !SIDEBAR_HIDDEN_AREAS.has(s) &&
      s !== "dashboard" &&
      s !== "impostazioni" &&
      s !== "archivio" &&
      s !== "chat" &&
      s !== "webmail"
  ).map((slug) => ({ slug, label: AREA_ROUTES[slug].label }));
}

export function sezioniStaticheArea(areaSlug: string): { slug: string; label: string }[] {
  const sections = sezioniArea(areaSlug);
  return sections.map((s) => ({ slug: s.slug, label: s.label }));
}

function sezioniArea(areaSlug: string): readonly NavItem[] {
  switch (areaSlug) {
    case "magazzino":
      return MAGAZZINO_SECTIONS;
    case "produzione":
      return PRODUZIONE_SECTIONS;
    case "amministrazione":
      return AMMINISTRAZIONE_SECTIONS;
    case "commerciale":
      return COMMERCIALE_SECTIONS;
    case "action":
      return ACTION_SECTIONS;
    case "strumenti":
      return STRUMENTI_SECTIONS;
    case "area-fiscale":
      return AREA_FISCALE_SECTIONS;
    case "promemorie-e-note":
      return PROMEMORIE_E_NOTE_SECTIONS;
    case "area-fornitori":
      return AREA_FORNITORI_SECTIONS;
    case "ricerca-sviluppo":
      return RICERCA_SVILUPPO_SECTIONS;
    default:
      return [];
  }
}

export function slugMenuVoce(label: string): string {
  const base = label
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return base || "voce";
}

export const collegaMappaPercorsoSchema = z.object({
  mappaId: z.string().uuid(),
  vistaEtichetta: z.string().trim().min(1).max(80),
  areaSlug: z.string().trim().min(1).max(40),
  rami: z
    .array(
      z.object({
        nodoId: z.string().uuid().optional(),
        etichetta: z.string().trim().min(1).max(120),
        slug: z.string().trim().max(80).optional(),
      })
    )
    .min(1)
    .max(8),
  posto: z.object({
    nodoId: z.string().uuid().optional(),
    etichetta: z.string().trim().min(1).max(120),
  }),
});

export type CollegaMappaPercorsoInput = z.infer<typeof collegaMappaPercorsoSchema>;

export type MappaMenuPercorsoNodo = {
  id: string;
  parentId: string | null;
  etichetta: string;
  slug: string;
  tipo: MappaMenuTipo;
  altreMappe: number;
};

export type MappaMenuPercorsoCaricato = {
  areaSlug: string;
  nodi: MappaMenuPercorsoNodo[];
};

export const rinominaPercorsoMappaSchema = z.object({
  mappaId: z.string().uuid(),
  nodi: z
    .array(
      z.object({
        nodoId: z.string().uuid(),
        etichetta: z.string().trim().min(1).max(120),
      })
    )
    .min(1)
    .max(9),
});

export type RinominaPercorsoMappaInput = z.infer<typeof rinominaPercorsoMappaSchema>;

export function mergeAreaNavWithMappaMenu(
  areaSlug: string,
  sections: readonly NavItem[],
  nodi: MappaMenuNodo[],
  mappe: MappaMenuFogliaNav[]
): NavItem[] {
  const scoped = nodi.filter((n) => n.areaSlug === areaSlug);
  function kids(parentId: string | null): NavItem[] {
    return scoped
      .filter((n) => n.parentId === parentId)
      .map((n) => nodoToNav(n, kids(n.id), mappe, areaSlug));
  }
  const roots = kids(null);
  const out: NavItem[] = sections.map((s) => {
    const extra = roots.find((r) => r.slug === s.slug);
    if (!extra || !isNavBranch(extra)) return s;
    if (!isNavBranch(s)) {
      return extra;
    }
    const existingSlugs = new Set(s.children.map((c) => c.slug));
    return {
      ...s,
      children: [
        ...s.children,
        ...extra.children.filter((c) => !existingSlugs.has(c.slug)),
      ],
    };
  });
  for (const r of roots) {
    if (!out.some((s) => s.slug === r.slug)) out.push(r);
  }
  return out;
}

function nodoToNav(
  n: MappaMenuNodo,
  children: NavItem[],
  mappe: MappaMenuFogliaNav[],
  areaSlug: string
): NavItem {
  if (n.tipo === "luogo") {
    const views = mappe.filter((m) => m.nodoId === n.id);
    if (views.length === 0) {
      return {
        slug: n.slug,
        label: n.etichetta,
        description: "Posto senza pianta collegata",
        path: AREA_ROUTES[areaSlug as AreaSlug]?.path ?? `/app/${areaSlug}`,
      };
    }
    return {
      slug: n.slug,
      label: n.etichetta,
      description:
        views.length === 1
          ? `Pianta ${views[0]!.vistaEtichetta}`
          : `${views.length} viste collegate`,
      path: `/app/pianta/${n.slug}`,
    };
  }
  if (children.length === 0) {
    return {
      slug: n.slug,
      label: n.etichetta,
      description: n.etichetta,
      path: AREA_ROUTES[areaSlug as AreaSlug]?.path ?? `/app/${areaSlug}`,
    };
  }
  return {
    slug: n.slug,
    label: n.etichetta,
    description: n.etichetta,
    path: firstLeafPath(children[0]!),
    children,
  };
}
