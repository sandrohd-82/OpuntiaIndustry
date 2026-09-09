import { isWebHubPath } from "@/lib/areas/web";
import { isNavBranch, type NavItem } from "@/lib/areas/nav-tree";

export type AccessTone = "on" | "off" | "unset" | "mixed";

function ownAccess(
  path: string,
  map: PageAccessMap
): boolean | undefined {
  const key = resolvePageKey(path);
  if (key in map) return map[key];
  if (path in map) return map[path];
  return undefined;
}

/** Figlie esplicite On/Off sotto un ramo (primo o secondo livello). */
export function subtreeChildFlags(
  rootKey: string,
  map: PageAccessMap
): { hasOn: boolean; hasOff: boolean } {
  let hasOn = false;
  let hasOff = false;
  const root = resolvePageKey(rootKey);
  for (const [k, v] of Object.entries(map)) {
    if (!isChildPageKeyOfSubtree(k, root) && !isChildPageKeyOfSubtree(k, rootKey)) {
      continue;
    }
    if (v) hasOn = true;
    else hasOff = true;
    if (hasOn && hasOff) break;
  }
  return { hasOn, hasOff };
}

function composeAccessTone(
  own: boolean | undefined,
  inheritedOn: boolean,
  inheritedOff: boolean,
  children: { hasOn: boolean; hasOff: boolean }
): AccessTone {
  const hasOn = own === true || inheritedOn || children.hasOn;
  const hasOff = own === false || inheritedOff || children.hasOff;
  if (hasOn && hasOff) return "mixed";
  if (hasOn) return "on";
  if (hasOff) return "off";
  return "unset";
}

/** page_key → visibile. Chiave assente = non impostato (grigio). */
export type PageAccessMap = Record<string, boolean>;

/** Voce di primo livello Web (non è uno slug AREA_ROUTES). */
export const WEB_AREA_ACCESS_KEY = "/app/web";

const AREA_ACCESS_KEY_RE = /^\/app\/[a-z0-9-]+$/;

export function isAreaAccessKey(value: string): boolean {
  return AREA_ACCESS_KEY_RE.test(value);
}

function isWebOwnedPageKey(pageKey: string): boolean {
  return (
    pageKey === WEB_AREA_ACCESS_KEY ||
    pageKey.startsWith(`${WEB_AREA_ACCESS_KEY}/`) ||
    pageKey.startsWith("/app/wikiopuntia") ||
    pageKey.startsWith("/app/amministrazione/portale") ||
    pageKey.startsWith("/app/amministrazione/schede/canali-pubblicazione")
  );
}

/** Chiave On/Off dell'area di primo livello che contiene il path. */
export function resolveAreaAccessKey(pathname: string): string {
  const raw = normalizeAppPath(pathname);
  if (
    raw === WEB_AREA_ACCESS_KEY ||
    raw.startsWith(`${WEB_AREA_ACCESS_KEY}/`) ||
    isWebHubPath(raw)
  ) {
    return WEB_AREA_ACCESS_KEY;
  }
  const match = raw.match(/^\/app\/[^/]+/);
  return match?.[0] ?? "/app/dashboard";
}

/** Pagine figlie da azzerare quando si imposta On/Off sull'area. */
export function isChildPageKeyOfArea(pageKey: string, areaKey: string): boolean {
  const key = String(pageKey ?? "").trim();
  if (!key || key === areaKey) return false;
  if (areaKey === WEB_AREA_ACCESS_KEY) {
    return isWebOwnedPageKey(key);
  }
  if (isWebOwnedPageKey(key)) return false;
  return key.startsWith(`${areaKey}/`);
}

/** Figlie di un ramo di menu (area di primo livello o sottocategoria). */
export function isChildPageKeyOfSubtree(pageKey: string, rootKey: string): boolean {
  const root = String(rootKey ?? "").trim();
  if (isAreaAccessKey(root)) return isChildPageKeyOfArea(pageKey, root);
  const key = String(pageKey ?? "").trim();
  if (!key || !root || key === root) return false;
  return key.startsWith(`${root}/`);
}

function pathPrefixes(pathname: string): string[] {
  const raw = normalizeAppPath(pathname);
  const parts = raw.split("/").filter(Boolean);
  const out: string[] = [];
  let acc = "";
  for (const part of parts) {
    acc += `/${part}`;
    if (acc === "/app") continue;
    out.push(acc);
  }
  return out;
}

export function isAccessOffAlongPath(path: string, map: PageAccessMap): boolean {
  const areaKey = resolveAreaAccessKey(path);
  if (map[areaKey] === false) return true;
  for (const prefix of pathPrefixes(path)) {
    const key = resolvePageKey(prefix);
    if (map[key] === false || map[prefix] === false) return true;
  }
  return false;
}

export function isAccessOnAlongPath(path: string, map: PageAccessMap): boolean {
  const areaKey = resolveAreaAccessKey(path);
  if (map[areaKey] === true) return true;
  for (const prefix of pathPrefixes(path)) {
    const key = resolvePageKey(prefix);
    if (map[key] === true || map[prefix] === true) return true;
  }
  return false;
}

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

export function toneForAreaAccess(
  areaKey: string,
  map: PageAccessMap
): AccessTone {
  return composeAccessTone(
    ownAccess(areaKey, map),
    false,
    false,
    subtreeChildFlags(areaKey, map)
  );
}

/**
 * Stato On/Off della voce.
 * Impostazione propria vince; altrimenti eredita dal ramo padre.
 * Se sotto ci sono sia On sia Off → mixed (verde+rosso).
 */
export function toneForSubtreeAccess(
  path: string,
  map: PageAccessMap
): AccessTone {
  const own = ownAccess(path, map);
  return composeAccessTone(
    own,
    own === undefined && isAccessOnAlongPath(path, map),
    own === undefined && isAccessOffAlongPath(path, map),
    subtreeChildFlags(path, map)
  );
}

export function toneForNavPath(
  path: string,
  map: PageAccessMap
): AccessTone {
  const own = ownAccess(path, map);
  return composeAccessTone(
    own,
    own === undefined && isAccessOnAlongPath(path, map),
    own === undefined && isAccessOffAlongPath(path, map),
    subtreeChildFlags(path, map)
  );
}

/** Operativo: area/ramo Off nasconde tutto; On mostra salvo pagina Off. */
export function isNavPathVisible(
  path: string,
  map: PageAccessMap,
  ancestorOn = false
): boolean {
  const key = resolvePageKey(path);
  const areaKey = resolveAreaAccessKey(path);
  if (isAccessOffAlongPath(path, map)) return false;
  if (
    map[areaKey] === true ||
    map[key] === true ||
    map[path] === true ||
    ancestorOn ||
    isAccessOnAlongPath(path, map)
  ) {
    return true;
  }
  if (key === areaKey || path === areaKey) {
    return Object.entries(map).some(
      ([k, v]) => v && resolveAreaAccessKey(k) === areaKey
    );
  }
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
    if (isAccessOffAlongPath(item.path, map)) continue;
    const own = map[item.path] ?? map[resolvePageKey(item.path)];
    if (own === false) continue;
    const on =
      own === true || ancestorOn || isAccessOnAlongPath(item.path, map);
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
