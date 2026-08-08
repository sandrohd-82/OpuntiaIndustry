export type OrdineDocumentoCliente = {
  name: string;
  mimeType: string;
  dataUrl: string;
};

export type OrdineRigaProdotto = {
  id: string;
  prodottoId: string;
  prodottoCodice: string;
  prodottoNome: string;
  quantita: number;
  prezzoUnitario: number;
  ivaPercentuale: number;
};

export type OrdineTrasporto = {
  azienda: string;
  imponibile: number;
  ivaPercentuale: number;
};

export type OrdineRicevuto = {
  id: string;
  /** Numero ordine interno. */
  numeroInterno: string;
  /** Alias legacy — uguale a numeroInterno. */
  numero: string;
  /** Numero ordine del cliente (opzionale). */
  numeroCliente: string;
  documentoOrdineCliente: OrdineDocumentoCliente | null;
  /** Ragione sociale (snapshot al momento del salvataggio). */
  cliente: string;
  /** Collegamento all’anagrafica clienti. */
  clienteId?: string;
  dataOrdine: string;
  righe: OrdineRigaProdotto[];
  trasporto: OrdineTrasporto;
  /** Totale complessivo (prodotti + trasporto, IVA inclusa). */
  importoEuro: number;
  note: string;
  createdAt: string;
};

/** Origine nello storico: inserimento manuale o chiusura automatica (futura). */
export type OrdineStoricoOrigine = "manuale" | "chiusura";

export type OrdineStorico = {
  id: string;
  numeroInterno: string;
  /** Alias legacy — uguale a numeroInterno. */
  numero: string;
  numeroCliente: string;
  documentoOrdineCliente: OrdineDocumentoCliente | null;
  cliente: string;
  clienteId?: string;
  dataOrdine: string;
  dataConsegna: string;
  righe: OrdineRigaProdotto[];
  trasporto: OrdineTrasporto;
  importoEuro: number;
  note: string;
  origine: OrdineStoricoOrigine;
  createdAt: string;
  sourceOrdineId?: string;
};

export const ORDINI_RICEVUTI_STORAGE_KEY = "opuntia.ordini-ricevuti.v1";
export const ORDINI_STORICO_STORAGE_KEY = "opuntia.ordini-storico.v1";

export const IVA_PERCENTUALI_COMUNI = [4, 5, 10, 22] as const;

export function emptyTrasporto(): OrdineTrasporto {
  return { azienda: "", imponibile: 0, ivaPercentuale: 22 };
}

export function newRigaProdotto(): OrdineRigaProdotto {
  return {
    id: `riga-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    prodottoId: "",
    prodottoCodice: "",
    prodottoNome: "",
    quantita: 1,
    prezzoUnitario: 0,
    ivaPercentuale: 22,
  };
}

export function imponibileRiga(riga: OrdineRigaProdotto): number {
  return roundMoney(riga.quantita * riga.prezzoUnitario);
}

export function ivaRiga(riga: OrdineRigaProdotto): number {
  return roundMoney(imponibileRiga(riga) * (riga.ivaPercentuale / 100));
}

export function totaleRiga(riga: OrdineRigaProdotto): number {
  return roundMoney(imponibileRiga(riga) + ivaRiga(riga));
}

export function ivaTrasporto(t: OrdineTrasporto): number {
  return roundMoney(t.imponibile * (t.ivaPercentuale / 100));
}

export function totaleTrasporto(t: OrdineTrasporto): number {
  return roundMoney(t.imponibile + ivaTrasporto(t));
}

export function totaleOrdine(
  righe: OrdineRigaProdotto[],
  trasporto: OrdineTrasporto
): number {
  const prodotti = righe.reduce((sum, r) => sum + totaleRiga(r), 0);
  return roundMoney(prodotti + totaleTrasporto(trasporto));
}

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function asFinite(value: unknown, fallback = 0): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeDocumento(
  raw: unknown
): OrdineDocumentoCliente | null {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Record<string, unknown>;
  const name = String(d.name ?? "").trim();
  const mimeType = String(d.mimeType ?? "").trim();
  const dataUrl = String(d.dataUrl ?? "").trim();
  if (!name || !dataUrl) return null;
  return { name, mimeType: mimeType || "application/pdf", dataUrl };
}

function normalizeRiga(raw: unknown): OrdineRigaProdotto | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  return {
    id: String(r.id ?? `riga-${Date.now()}`),
    prodottoId: String(r.prodottoId ?? ""),
    prodottoCodice: String(r.prodottoCodice ?? ""),
    prodottoNome: String(r.prodottoNome ?? ""),
    quantita: asFinite(r.quantita, 0),
    prezzoUnitario: asFinite(r.prezzoUnitario, 0),
    ivaPercentuale: asFinite(r.ivaPercentuale, 22),
  };
}

function normalizeTrasporto(raw: unknown): OrdineTrasporto {
  if (!raw || typeof raw !== "object") return emptyTrasporto();
  const t = raw as Record<string, unknown>;
  return {
    azienda: String(t.azienda ?? "").trim(),
    imponibile: asFinite(t.imponibile, 0),
    ivaPercentuale: asFinite(t.ivaPercentuale, 22),
  };
}

function normalizeOrdineBase(raw: Record<string, unknown>) {
  const numeroInterno = String(raw.numeroInterno ?? raw.numero ?? "").trim();
  const righeRaw = Array.isArray(raw.righe) ? raw.righe : [];
  const righe = righeRaw
    .map(normalizeRiga)
    .filter((r): r is OrdineRigaProdotto => Boolean(r));
  const trasporto = normalizeTrasporto(raw.trasporto);
  const importoStored = asFinite(raw.importoEuro, NaN);
  return {
    numeroInterno,
    numero: numeroInterno,
    numeroCliente: String(raw.numeroCliente ?? "").trim(),
    documentoOrdineCliente: normalizeDocumento(raw.documentoOrdineCliente),
    cliente: String(raw.cliente ?? "").trim(),
    clienteId: String(raw.clienteId ?? "").trim() || undefined,
    dataOrdine: String(raw.dataOrdine ?? ""),
    righe,
    trasporto,
    importoEuro: Number.isFinite(importoStored)
      ? importoStored
      : totaleOrdine(righe, trasporto),
    note: String(raw.note ?? "").trim(),
    createdAt: String(raw.createdAt ?? new Date().toISOString()),
  };
}

export function normalizeOrdineRicevuto(raw: unknown): OrdineRicevuto | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const base = normalizeOrdineBase(r);
  if (!base.numeroInterno && !base.cliente) return null;
  return {
    id: String(r.id ?? `ord-${Date.now()}`),
    ...base,
  };
}

export function normalizeOrdineStorico(raw: unknown): OrdineStorico | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const base = normalizeOrdineBase(r);
  if (!base.numeroInterno && !base.cliente) return null;
  const origine = r.origine === "chiusura" ? "chiusura" : "manuale";
  return {
    id: String(r.id ?? `sto-${Date.now()}`),
    ...base,
    dataConsegna: String(r.dataConsegna ?? base.dataOrdine),
    origine,
    sourceOrdineId: String(r.sourceOrdineId ?? "").trim() || undefined,
  };
}

export function loadOrdiniRicevuti(): OrdineRicevuto[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(ORDINI_RICEVUTI_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(normalizeOrdineRicevuto)
      .filter((o): o is OrdineRicevuto => Boolean(o));
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

export function loadOrdiniStorico(): OrdineStorico[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(ORDINI_STORICO_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(normalizeOrdineStorico)
      .filter((o): o is OrdineStorico => Boolean(o));
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

function nextNumeroInterno(
  prefix: "ORD" | "STO",
  existingNumeri: string[],
  year: number
): string {
  const fullPrefix = `${prefix}-${year}-`;
  const seq =
    existingNumeri.filter((n) => n.startsWith(fullPrefix)).length + 1;
  return `${fullPrefix}${String(seq).padStart(3, "0")}`;
}

export type OrdineDettaglioInput = {
  cliente: string;
  clienteId?: string;
  dataOrdine: string;
  numeroInterno?: string;
  numeroCliente?: string;
  documentoOrdineCliente?: OrdineDocumentoCliente | null;
  righe: OrdineRigaProdotto[];
  trasporto: OrdineTrasporto;
  note?: string;
};

export function createOrdineRicevuto(input: {
  existing: OrdineRicevuto[];
} & OrdineDettaglioInput): OrdineRicevuto {
  const year = new Date().getFullYear();
  const numeroInterno =
    input.numeroInterno?.trim() ||
    nextNumeroInterno(
      "ORD",
      input.existing.map((o) => o.numeroInterno || o.numero),
      year
    );
  const trasporto = {
    azienda: input.trasporto.azienda.trim(),
    imponibile: asFinite(input.trasporto.imponibile),
    ivaPercentuale: asFinite(input.trasporto.ivaPercentuale, 22),
  };
  const righe = input.righe.filter((r) => r.prodottoId && r.quantita > 0);
  return {
    id: `ord-${Date.now()}`,
    numeroInterno,
    numero: numeroInterno,
    numeroCliente: input.numeroCliente?.trim() ?? "",
    documentoOrdineCliente: input.documentoOrdineCliente ?? null,
    cliente: input.cliente.trim(),
    clienteId: input.clienteId?.trim() || undefined,
    dataOrdine: input.dataOrdine,
    righe,
    trasporto,
    importoEuro: totaleOrdine(righe, trasporto),
    note: input.note?.trim() ?? "",
    createdAt: new Date().toISOString(),
  };
}

export function createOrdineStoricoManuale(input: {
  existing: OrdineStorico[];
  dataConsegna: string;
} & OrdineDettaglioInput): OrdineStorico {
  const year = new Date(input.dataOrdine || Date.now()).getFullYear();
  const numeroInterno =
    input.numeroInterno?.trim() ||
    nextNumeroInterno(
      "STO",
      input.existing.map((o) => o.numeroInterno || o.numero),
      year
    );
  const trasporto = {
    azienda: input.trasporto.azienda.trim(),
    imponibile: asFinite(input.trasporto.imponibile),
    ivaPercentuale: asFinite(input.trasporto.ivaPercentuale, 22),
  };
  const righe = input.righe.filter((r) => r.prodottoId && r.quantita > 0);
  return {
    id: `sto-${Date.now()}`,
    numeroInterno,
    numero: numeroInterno,
    numeroCliente: input.numeroCliente?.trim() ?? "",
    documentoOrdineCliente: input.documentoOrdineCliente ?? null,
    cliente: input.cliente.trim(),
    clienteId: input.clienteId?.trim() || undefined,
    dataOrdine: input.dataOrdine,
    dataConsegna: input.dataConsegna,
    righe,
    trasporto,
    importoEuro: totaleOrdine(righe, trasporto),
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
    numeroInterno: ordine.numeroInterno || ordine.numero,
    numero: ordine.numeroInterno || ordine.numero,
    numeroCliente: ordine.numeroCliente ?? "",
    documentoOrdineCliente: ordine.documentoOrdineCliente ?? null,
    cliente: ordine.cliente,
    clienteId: ordine.clienteId,
    dataOrdine: ordine.dataOrdine,
    dataConsegna,
    righe: ordine.righe ?? [],
    trasporto: ordine.trasporto ?? emptyTrasporto(),
    importoEuro: ordine.importoEuro,
    note: ordine.note,
    origine: "chiusura",
    createdAt: new Date().toISOString(),
    sourceOrdineId: ordine.id,
  };
}

export function readFileAsDocumentoCliente(
  file: File
): Promise<OrdineDocumentoCliente> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve({
        name: file.name,
        mimeType: file.type || "application/pdf",
        dataUrl: String(reader.result ?? ""),
      });
    };
    reader.onerror = () => reject(new Error("Lettura file non riuscita."));
    reader.readAsDataURL(file);
  });
}
