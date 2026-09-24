/** Chiave padre delle voci di primo livello nel menu laterale. */
export const NAV_ROOT_KEY = "__root__";

/** Da questo strato lo sfondo è abbastanza chiaro: testo scuro. */
export const NAV_LAYER_INVERT_FROM = 2;

export type NavContrast = "light" | "dark";

export function navContrast(layer: number): NavContrast {
  return layer >= NAV_LAYER_INVERT_FROM ? "dark" : "light";
}

export function capNavLayer(layer: number): number {
  return Math.min(Math.max(Math.floor(layer), 0), 4);
}

export function pruneAccordionFrom(
  map: Record<string, string>,
  start: string
): Record<string, string> {
  const next = { ...map };
  const drop = new Set<string>([start]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const [parent, child] of Object.entries(next)) {
      if (drop.has(parent) && !drop.has(child)) {
        drop.add(child);
        grew = true;
      }
    }
  }
  for (const key of Object.keys(next)) {
    if (drop.has(key) || drop.has(next[key])) delete next[key];
  }
  return next;
}

export function toggleAccordion(
  map: Record<string, string>,
  parentKey: string,
  childKey: string
): { next: Record<string, string>; closing: boolean } {
  if (map[parentKey] === childKey) {
    const without = { ...map };
    delete without[parentKey];
    return { next: pruneAccordionFrom(without, childKey), closing: true };
  }
  const prevChild = map[parentKey];
  let next = { ...map, [parentKey]: childKey };
  if (prevChild && prevChild !== childKey) {
    next = pruneAccordionFrom(next, prevChild);
    next[parentKey] = childKey;
  }
  return { next, closing: false };
}
