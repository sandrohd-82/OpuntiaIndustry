export type SedeFornitore = {
  nazione: string;
  provincia: string;
  citta: string;
  cap: string;
  indirizzo: string;
};

export type Fornitore = {
  id: string;
  ragioneSociale: string;
  partitaIva: string;
  sedeAmministrativa: SedeFornitore;
  sedeMagazzino: SedeFornitore;
  prodottiAcquistati: string[];
  createdAt: string;
};

export type FornitoreInput = {
  ragioneSociale: string;
  partitaIva: string;
  sedeAmministrativa: SedeFornitore;
  sedeMagazzino: SedeFornitore;
  prodottiAcquistati: string[];
};

export const FORNITORI_STORAGE_KEY = "opuntia.fornitori.v1";

export function emptySede(): SedeFornitore {
  return {
    nazione: "",
    provincia: "",
    citta: "",
    cap: "",
    indirizzo: "",
  };
}

function normalizeSede(sede: SedeFornitore): SedeFornitore {
  return {
    nazione: sede.nazione.trim(),
    provincia: sede.provincia.trim(),
    citta: sede.citta.trim(),
    cap: sede.cap.trim(),
    indirizzo: sede.indirizzo.trim(),
  };
}

export function loadFornitori(): Fornitore[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(FORNITORI_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Fornitore[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveFornitori(fornitori: Fornitore[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(FORNITORI_STORAGE_KEY, JSON.stringify(fornitori));
  window.dispatchEvent(new Event("opuntia-fornitori-updated"));
}

export function createFornitore(input: FornitoreInput): Fornitore {
  return {
    id: `forn-${Date.now()}`,
    ragioneSociale: input.ragioneSociale.trim(),
    partitaIva: input.partitaIva.trim(),
    sedeAmministrativa: normalizeSede(input.sedeAmministrativa),
    sedeMagazzino: normalizeSede(input.sedeMagazzino),
    prodottiAcquistati: input.prodottiAcquistati
      .map((p) => p.trim())
      .filter(Boolean),
    createdAt: new Date().toISOString(),
  };
}

export function formatSedeBreve(sede: SedeFornitore): string {
  const parts = [sede.citta, sede.provincia, sede.nazione].filter(Boolean);
  return parts.length ? parts.join(", ") : "—";
}
