export type NavLeaf = {
  slug: string;
  label: string;
  description: string;
  path: string;
};

export type NavBranch = {
  slug: string;
  label: string;
  description: string;
  path: string;
  children: readonly NavLeaf[];
};

export type NavItem = NavLeaf | NavBranch;

export function isNavBranch(item: NavItem): item is NavBranch {
  return "children" in item && Array.isArray(item.children);
}

export function firstNavLeafPath(sections: readonly NavItem[]): string {
  const first = sections[0];
  if (!first) return "/app/dashboard";
  if (isNavBranch(first)) {
    return first.children[0]?.path ?? first.path;
  }
  return first.path;
}

export function resolveNavPage(
  sections: readonly NavItem[],
  segments: string[]
): { label: string; description: string } | null {
  if (segments.length === 0) return null;

  const [first, second] = segments;
  const section = sections.find((item) => item.slug === first);
  if (!section) return null;

  if (isNavBranch(section)) {
    if (!second) {
      // Hub del ramo (es. Grafici): pagina del branch senza sottovoce
      return { label: section.label, description: section.description };
    }
    const child = section.children.find((item) => item.slug === second);
    if (!child || segments.length > 2) return null;
    return { label: child.label, description: child.description };
  }

  if (segments.length > 1) return null;
  return { label: section.label, description: section.description };
}
