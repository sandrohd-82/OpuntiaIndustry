export type OrdineRicevuto = {
  id: string;
  numero: string;
  /** Ragione sociale (snapshot al momento del salvataggio). */
  cliente: string;
  /** Collegamento all’anagrafica clienti. */
  clienteId?: string;
  dataOrdine: string;
  importoEuro: number;
  note: string;
  createdAt: string;
};

/** Origine nello storico: inserimento manuale o chiusura automatica (futura). */
export type OrdineStoricoOrigine = "manuale" | "chiusura";

export type OrdineStorico = {
  id: string;
  numero: string;
  /** Ragione sociale (snapshot al momento del salvataggio). */
  cliente: string;
  /** Collegamento all’anagrafica clienti. */
  clienteId?: string;
  dataOrdine: string;
  /** Data di consegna / conclusione dell’ordine. */
  dataConsegna: string;
  importoEuro: number;
  note: string;
  origine: OrdineStoricoOrigine;
  createdAt: string;
  /** Id ordine operativo da cui è stato archiviato (se chiusura automatica). */
  sourceOrdineId?: string;
};

export const ORDINI_RICEVUTI_STORAGE_KEY = "opuntia.ordini-ricevuti.v1";
export const ORDINI_STORICO_STORAGE_KEY = "opuntia.ordini-storico.v1";

export function loadOrdiniRicevuti(): OrdineRicevuto[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(ORDINI_RICEVUTI_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as OrdineRicevuto[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveOrdiniRicevuti(ordini: OrdineRicevuto[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    ORDINI_RICEVUTI_STORAGE_KEY,
    JSON.stringify(ordini)
  );
  window.dispatchEvent(new Event("opuntia-ordini-ricevuti-updated"));
}

export function createOrdineRicevuto(input: {
  cliente: string;
  clienteId?: string;
  dataOrdine: string;
  importoEuro: number;
  note?: string;
  existing: OrdineRicevuto[];
}): OrdineRicevuto {
  const year = new Date().getFullYear();
  const seq =
    input.existing.filter((o) => o.numero.startsWith(`ORD-${year}-`)).length +
    1;
  return {
    id: `ord-${Date.now()}`,
    numero: `ORD-${year}-${String(seq).padStart(3, "0")}`,
    cliente: input.cliente.trim(),
    clienteId: input.clienteId?.trim() || undefined,
    dataOrdine: input.dataOrdine,
    importoEuro: input.importoEuro,
    note: input.note?.trim() ?? "",
    createdAt: new Date().toISOString(),
  };
}

export function loadOrdiniStorico(): OrdineStorico[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(ORDINI_STORICO_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as OrdineStorico[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveOrdiniStorico(ordini: OrdineStorico[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    ORDINI_STORICO_STORAGE_KEY,
    JSON.stringify(ordini)
  );
  window.dispatchEvent(new Event("opuntia-ordini-storico-updated"));
}

function nextStoricoNumero(existing: OrdineStorico[], year: number): string {
  const prefix = `STO-${year}-`;
  const seq =
    existing.filter((o) => o.numero.startsWith(prefix)).length + 1;
  return `${prefix}${String(seq).padStart(3, "0")}`;
}

/** Inserimento manuale di un ordine già concluso in passato. */
export function createOrdineStoricoManuale(input: {
  cliente: string;
  clienteId?: string;
  dataOrdine: string;
  dataConsegna: string;
  importoEuro: number;
  note?: string;
  numero?: string;
  existing: OrdineStorico[];
}): OrdineStorico {
  const year = new Date(input.dataOrdine || Date.now()).getFullYear();
  const numero =
    input.numero?.trim() || nextStoricoNumero(input.existing, year);
  return {
    id: `sto-${Date.now()}`,
    numero,
    cliente: input.cliente.trim(),
    clienteId: input.clienteId?.trim() || undefined,
    dataOrdine: input.dataOrdine,
    dataConsegna: input.dataConsegna,
    importoEuro: input.importoEuro,
    note: input.note?.trim() ?? "",
    origine: "manuale",
    createdAt: new Date().toISOString(),
  };
}

/**
 * Archivia un ordine operativo nello storico (usata dalla chiusura automatica futura).
 * Non rimuove l’ordine dalla lista operativa: lo fa il chiamante.
 */
export function archiveOrdineToStorico(
  ordine: OrdineRicevuto,
  dataConsegna: string
): OrdineStorico {
  return {
    id: `sto-${Date.now()}-${ordine.id}`,
    numero: ordine.numero,
    cliente: ordine.cliente,
    clienteId: ordine.clienteId,
    dataOrdine: ordine.dataOrdine,
    dataConsegna,
    importoEuro: ordine.importoEuro,
    note: ordine.note,
    origine: "chiusura",
    createdAt: new Date().toISOString(),
    sourceOrdineId: ordine.id,
  };
}
