import {
  firstNavLeafPath,
  resolveNavPage,
  type NavItem,
} from "@/lib/areas/nav-tree";

/** Sottosezioni WebMail (menu laterale) */
export const WEBMAIL_SECTIONS: readonly NavItem[] = [
  {
    slug: "caselle",
    label: "Caselle e messaggi",
    description:
      "Caselle personali/condivise, categorie, collegamento aziende e referenti",
    path: "/app/webmail/caselle",
  },
] as const;

export function getFirstWebmailPath(): string {
  return firstNavLeafPath(WEBMAIL_SECTIONS);
}

export function resolveWebmailPage(segments: string[]) {
  return resolveNavPage(WEBMAIL_SECTIONS, segments);
}
