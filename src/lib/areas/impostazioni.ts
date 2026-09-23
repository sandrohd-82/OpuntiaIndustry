import {
  firstNavLeafPath,
  resolveNavPage,
  type NavItem,
} from "@/lib/areas/nav-tree";

export const IMPOSTAZIONI_SECTIONS: readonly NavItem[] = [
  {
    slug: "fiscale",
    label: "Fiscale",
    description: "2FA e profilo fiscale aziendale",
    path: "/app/impostazioni/fiscale",
    adminOnly: true,
  },
  {
    slug: "sedi",
    label: "Sedi",
    description: "Sedi aziendali: partenza, magazzini, terreni e legale",
    path: "/app/impostazioni/sedi",
    adminOnly: true,
  },
];

export function firstImpostazioniPath(): string {
  return firstNavLeafPath(IMPOSTAZIONI_SECTIONS);
}

export function resolveImpostazioniPage(segments: string[]) {
  return resolveNavPage(IMPOSTAZIONI_SECTIONS, segments);
}
