import {
  firstNavLeafPath,
  resolveNavPage,
  type NavItem,
} from "@/lib/areas/nav-tree";

export const SCRIPT_SECTIONS: readonly NavItem[] = [
  {
    slug: "elenco",
    label: "Elenco",
    description: "Funzioni del gestionale da collegare alle attività.",
    path: "/app/script/elenco",
  },
];

export function getFirstScriptPath(): string {
  return firstNavLeafPath(SCRIPT_SECTIONS);
}

export function resolveScriptPage(segments: string[]) {
  return resolveNavPage(SCRIPT_SECTIONS, segments);
}
