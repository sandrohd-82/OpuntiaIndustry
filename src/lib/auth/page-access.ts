import { isNavBranch, type NavItem } from "@/lib/areas/nav-tree";

export type AccessTone = "on" | "off" | "unset";

/** page_key → visibile. Chiave assente = non impostato (grigio). */
export type PageAccessMap = Record<string, boolean>;

export function normalizeAppPath(pathname: string): string {
  const raw = (pathname.split("?")[0] ?? "").trim();
  if (!raw) return "/app/dashboard";
  const noSlash = raw.replace(/\/+$/, "");
  return noSlash || "/app/dashboard";
}

/**
 * Chiave stabile per On/Off: niente UUID dinamici (caselle, thread, fatture).
 */
export function resolvePageKey(pathname: string): string {
  const raw = normalizeAppPath(pathname);
  if (!raw.startsWith("/app")) return "/app/dashboard";

  if (raw.startsWith("/app/webmail/caselle")) {
    return "/app/webmail/caselle";
  }
  if (
    raw.startsWith("/app/chat/thread") ||
    raw.startsWith("/app/chat/argomento")
  ) {
    return "/app/chat";
  }
  if (raw.startsWith("/app/amministrazione/fatture/")) {
    return "/app/amministrazione/fatture";
  }
  if (raw.startsWith("/app/ricerca-sviluppo/ricerca/")) {
    return "/app/ricerca-sviluppo/ricerca";
  }

  const parts = raw.split("/").filter(Boolean);
  if (parts.length > 5) {
    return `/${parts.slice(0, 5).join("/")}`;
  }
  return raw;
}

export function toneForNavPath(
  path: string,
  map: PageAccessMap
): AccessTone {
  const key = resolvePageKey(path);
  if (key in map) return map[key] ? "on" : "off";
  if (path in map) return map[path] ? "on" : "off";

  const childHits = Object.entries(map).filter(
    ([k]) => k.startsWith(`${key}/`) || k.startsWith(`${path}/`)
  );
  if (childHits.some(([, v]) => v)) return "on";
  if (childHits.length > 0 && childHits.every(([, v]) => !v)) return "off";
  return "unset";
}

/** Operativo: visibile se On, oppure discendente On, oppure antenato On e non Off. */
export function isNavPathVisible(
  path: string,
  map: PageAccessMap,
  ancestorOn = false
): boolean {
  const key = resolvePageKey(path);
  if (map[key] === false || map[path] === false) return false;
  if (map[key] === true || map[path] === true || ancestorOn) return true;
  return Object.entries(map).some(
    ([k, v]) => v && (k.startsWith(`${key}/`) || k.startsWith(`${path}/`))
  );
}

export function filterNavByPageAccess(
  items: readonly NavItem[],
  map: PageAccessMap,
  ancestorOn = false
): NavItem[] {
  const out: NavItem[] = [];
  for (const item of items) {
    const own = map[item.path] ?? map[resolvePageKey(item.path)];
    if (own === false) continue;
    const on = own === true || ancestorOn;
    if (isNavBranch(item)) {
      const children = filterNavByPageAccess(item.children, map, on);
      if (on || children.length > 0) {
        out.push({
          ...item,
          children: on
            ? filterNavByPageAccess(item.children, map, true)
            : children,
        });
      }
      continue;
    }
    if (on) out.push(item);
  }
  return out;
}

export function pageAccessFromRows(
  rows: Array<{ page_key?: string | null; visibile?: boolean | null }>
): PageAccessMap {
  const map: PageAccessMap = {};
  for (const row of rows) {
    const key = String(row.page_key ?? "").trim();
    if (!key) continue;
    map[key] = Boolean(row.visibile);
  }
  return map;
}
