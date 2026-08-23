export type NavBadge =
  | { kind: "status"; active: boolean }
  | { kind: "count"; count: number };

export type NavLeaf = {
  slug: string;
  label: string;
  description: string;
  path: string;
  /** Indicatore sidebar (stato area / contatore). */
  badge?: NavBadge;
};

export type NavBranch = {
  slug: string;
  label: string;
  description: string;
  path: string;
  badge?: NavBadge;
  /** Foglie o sotto-rami (max profondità usata: 3 livelli area→ramo→foglia). */
  children: readonly NavItem[];
};

export type NavItem = NavLeaf | NavBranch;

export function isNavBranch(item: NavItem): item is NavBranch {
  return "children" in item && Array.isArray(item.children);
}

/** Prima foglia raggiungibile (discesa ricorsiva nei rami). */
export function firstLeafPath(item: NavItem): string {
  if (!isNavBranch(item)) return item.path;
  const first = item.children[0];
  if (!first) return item.path;
  return firstLeafPath(first);
}

export function firstNavLeafPath(sections: readonly NavItem[]): string {
  const first = sections[0];
  if (!first) return "/app/dashboard";
  return firstLeafPath(first);
}

export function resolveNavPage(
  sections: readonly NavItem[],
  segments: string[]
): { label: string; description: string } | null {
  if (segments.length === 0) return null;

  let items: readonly NavItem[] = sections;
  let current: NavItem | undefined;

  for (let i = 0; i < segments.length; i++) {
    const slug = segments[i];
    current = items.find((item) => item.slug === slug);
    if (!current) return null;

    const isLast = i === segments.length - 1;
    if (isLast) {
      return { label: current.label, description: current.description };
    }

    if (!isNavBranch(current)) return null;
    items = current.children;
  }

  return null;
}

/** Trova un item per path di slug (es. ["barcode","generatore"]). */
export function findNavItem(
  sections: readonly NavItem[],
  segments: string[]
): NavItem | null {
  if (segments.length === 0) return null;
  let items: readonly NavItem[] = sections;
  let current: NavItem | undefined;
  for (const slug of segments) {
    current = items.find((item) => item.slug === slug);
    if (!current) return null;
    if (isNavBranch(current)) {
      items = current.children;
    } else {
      items = [];
    }
  }
  return current ?? null;
}

/** Slug dei rami aperti lungo il pathname corrente. */
export function openKeysFromPathname(
  sections: readonly NavItem[],
  pathname: string,
  prefixKeys: string[] = []
): string[] {
  const keys: string[] = [...prefixKeys];
  for (const item of sections) {
    if (!pathname.startsWith(item.path)) continue;
    keys.push(item.slug);
    if (isNavBranch(item)) {
      keys.push(...openKeysFromPathname(item.children, pathname));
    }
  }
  return keys;
}
