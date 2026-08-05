export type FoglioLavorazioneStato = "aperto" | "chiuso";

/** Foglio di lavorazione (~24h) */
export type FoglioLavorazione = {
  id: string;
  /** Codice visuale es. FL-2026-001 */
  label: string;
  descrizione: string;
  /** Prodotto / lotto in lavorazione */
  prodotto: string;
  stato: FoglioLavorazioneStato;
  startedAt: string;
  /** Fine prevista (tipicamente +24h) */
  expectedEndAt: string;
  closedAt: string | null;
  note: string;
};

export const FOGLI_STORAGE_KEY = "opuntia.fogli-lavorazione.v1";

/** Seed iniziale vuoto: i fogli si creano dalla pagina Fogli Lavorazione */
export const FOGLI_LAVORAZIONE_INITIAL: FoglioLavorazione[] = [];

export function isFoglioAperto(foglio: FoglioLavorazione) {
  return foglio.stato === "aperto";
}

export function createFoglioLavorazione(input: {
  prodotto: string;
  descrizione?: string;
  note?: string;
  existing: FoglioLavorazione[];
}): FoglioLavorazione {
  const now = new Date();
  const year = now.getFullYear();
  const seq =
    input.existing.filter((f) => f.label.startsWith(`FL-${year}-`)).length + 1;
  const label = `FL-${year}-${String(seq).padStart(3, "0")}`;
  const startedAt = now.toISOString();
  const expectedEndAt = new Date(
    now.getTime() + 24 * 60 * 60 * 1000
  ).toISOString();

  return {
    id: `fl-${Date.now()}`,
    label,
    descrizione:
      input.descrizione?.trim() ||
      `Lavorazione ${input.prodotto.trim() || "senza nome"}`,
    prodotto: input.prodotto.trim() || "Non specificato",
    stato: "aperto",
    startedAt,
    expectedEndAt,
    closedAt: null,
    note: input.note?.trim() ?? "",
  };
}

export function formatFoglioRange(foglio: FoglioLavorazione) {
  try {
    const start = new Date(foglio.startedAt).toLocaleString("it-IT", {
      dateStyle: "short",
      timeStyle: "short",
    });
    const end = new Date(foglio.expectedEndAt).toLocaleString("it-IT", {
      dateStyle: "short",
      timeStyle: "short",
    });
    return `${start} → ${end}`;
  } catch {
    return "—";
  }
}

export function loadFogliFromStorage(): FoglioLavorazione[] {
  if (typeof window === "undefined") return FOGLI_LAVORAZIONE_INITIAL;
  try {
    const raw = window.localStorage.getItem(FOGLI_STORAGE_KEY);
    if (!raw) return FOGLI_LAVORAZIONE_INITIAL;
    const parsed = JSON.parse(raw) as FoglioLavorazione[];
    return Array.isArray(parsed) ? parsed : FOGLI_LAVORAZIONE_INITIAL;
  } catch {
    return FOGLI_LAVORAZIONE_INITIAL;
  }
}

export function saveFogliToStorage(fogli: FoglioLavorazione[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(FOGLI_STORAGE_KEY, JSON.stringify(fogli));
  window.dispatchEvent(new Event("opuntia-fogli-updated"));
}
