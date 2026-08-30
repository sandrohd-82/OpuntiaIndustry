import { WIKIOPUNTIA_SECTIONS } from "@/lib/areas/wikiopuntia";
import type { NavItem } from "@/lib/areas/nav-tree";

/** Sito B2B — ex «Portale web» in Amministrazione. */
export const OPUNTIA_ITALIA_NAV: NavItem = {
  slug: "portale",
  label: "Opuntia Italia",
  description: "Lead e newsletter da opuntiaitalia.com",
  path: "/app/amministrazione/portale",
  children: [
    {
      slug: "richieste-contatto",
      label: "Richieste di contatto",
      description: "Form contatti del sito B2B Opuntia Italia",
      path: "/app/amministrazione/portale/richieste-contatto",
    },
    {
      slug: "newsletter",
      label: "Newsletter",
      description: "Iscritti newsletter / pillole",
      path: "/app/amministrazione/portale/newsletter",
    },
  ],
};

/** WikiOpuntia sotto Web (stesse voci dell’area, incluso contatto). */
export const WIKI_UNDER_WEB: NavItem = {
  slug: "wikiopuntia-hub",
  label: "WikiOpuntia",
  description: "Biblioteca, Knowledge Base e richieste wikiopuntia.com",
  path: "/app/wikiopuntia",
  children: [...WIKIOPUNTIA_SECTIONS],
};

export function webSectionsForAccess(input: {
  italia: boolean;
  wiki: boolean;
}): NavItem[] {
  const items: NavItem[] = [];
  if (input.italia) items.push(OPUNTIA_ITALIA_NAV);
  if (input.wiki) items.push(WIKI_UNDER_WEB);
  return items;
}
