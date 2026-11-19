/** Letture senza scritture: possono rispondere a GET. */
export const LETTURE_GET = [
  "notifiche-non-lette",
  "avvisi-pendenti",
  "ticket-badge",
  "ordini-da-processare",
  "mappa-menu",
  "produzione-aree",
  "haccp-routine",
  "webmail-menu",
  "vapid-pubblica",
] as const;

/**
 * Hanno effetti oltre la lettura: rilevamento Trello, archivio dei preventivi
 * scaduti, e il bootstrap che include quell'archivio. Restano POST.
 */
export const CONTROLLI_POST = ["trello", "preventivi-spedizione", "bootstrap"] as const;

export type LetturaGet = (typeof LETTURE_GET)[number];
export type ControlloPost = (typeof CONTROLLI_POST)[number];

export function classificaControlloNav(
  nome: string
): "get" | "post" | null {
  if ((LETTURE_GET as readonly string[]).includes(nome)) return "get";
  if ((CONTROLLI_POST as readonly string[]).includes(nome)) return "post";
  return null;
}
