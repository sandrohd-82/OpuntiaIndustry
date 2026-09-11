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
  /** Voce visibile solo ad Admin / Super Admin. */
  adminOnly?: boolean;
};

export type NavBranch = {
  slug: string;
  label: string;
  description: string;
  path: string;
  badge?: NavBadge;
  /** Voce visibile solo ad Admin / Super Admin. */
  adminOnly?: boolean;
  /** Foglie o sotto-rami (max profondità usata: 3 livelli area→ramo→foglia). */
  children: readonly NavItem[];
};

export type NavItem = NavLeaf | NavBranch;

export function isNavBranch(item: NavItem): item is NavBranch {
  return "children" in item && Array.isArray(item.children);
}

function findNavChild(
  items: readonly NavItem[],
  slug: string
): NavItem | undefined {
  const direct = items.find((item) => item.slug === slug);
  if (direct) return direct;
  for (const item of items) {
    if (!isNavBranch(item)) continue;
    const nested = findNavChild(item.children, slug);
    if (nested) return nested;
  }
  return undefined;
}

function navSubtreeMatches(item: NavItem, pathname: string): boolean {
  if (pathname === item.path || pathname.startsWith(`${item.path}/`)) return true;
  if (!isNavBranch(item)) return false;
  return item.children.some((child) => navSubtreeMatches(child, pathname));
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
    current = findNavChild(items, slug);
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
    current = findNavChild(items, slug);
    if (!current) return null;
    if (isNavBranch(current)) {
      items = current.children;
    } else {
      items = [];
    }
  }
  return current ?? null;
}

/** Nasconde rami/foglie riservati ad Admin. */
export function filterNavByAdminOnly(
  items: readonly NavItem[],
  isAdminLike: boolean
): NavItem[] {
  const out: NavItem[] = [];
  for (const item of items) {
    if (item.adminOnly && !isAdminLike) continue;
    if (isNavBranch(item)) {
      const children = filterNavByAdminOnly(item.children, isAdminLike);
      if (children.length === 0 && item.adminOnly) continue;
      out.push({ ...item, children });
      continue;
    }
    out.push(item);
  }
  return out;
}

/** Applica il contatore «Da processare» sul ramo omonimo. */
export function applyDaProcessareBadge(
  items: readonly NavItem[],
  count: number
): NavItem[] {
  return items.map((item) => {
    const badge =
      item.slug === "da-processare" && count > 0
        ? ({ kind: "count", count } satisfies NavBadge)
        : item.slug === "da-processare"
          ? undefined
          : item.badge;
    if (isNavBranch(item)) {
      return {
        ...item,
        badge,
        children: applyDaProcessareBadge(item.children, count),
      };
    }
    return { ...item, badge };
  });
}

/** Slug dei rami aperti lungo il pathname corrente. */
export function openKeysFromPathname(
  sections: readonly NavItem[],
  pathname: string,
  prefixKeys: string[] = []
): string[] {
  const keys: string[] = [...prefixKeys];
  for (const item of sections) {
    if (!navSubtreeMatches(item, pathname)) continue;
    keys.push(item.slug);
    keys.push(item.path);
    if (isNavBranch(item)) {
      keys.push(...openKeysFromPathname(item.children, pathname));
    }
  }
  return keys;
}
