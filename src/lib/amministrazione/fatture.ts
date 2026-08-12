import { z } from "zod";
import type {
  FatturaDocumentoStato,
  FatturaEmessaDilazioneRow,
  FatturaEmessaRigaRow,
  FatturaEmessaRow,
  FatturaRicevutaDilazioneRow,
  FatturaRicevutaRigaRow,
  FatturaRicevutaRow,
  FatturaStatoPagamento,
} from "@/types/database";

export type FatturaKind = "emessa" | "ricevuta" | "nota_credito";

export type FatturaAllegatoMeta = {
  storagePath: string;
  fileName: string;
};

export type FatturaRiga = {
  id?: string;
  prodottoId: string | null;
  codice: string;
  descrizione: string;
  quantita: number;
  /** Prezzo di listino (unitario). */
  prezzoUnitario: number;
  /** Sconto % sul listino (0–100). */
  scontoPercentuale: number;
  importo: number;
};

export type FatturaDilazione = {
  id?: string;
  dataScadenza: string;
  importo: number;
  statoPagamento: FatturaStatoPagamento;
  note?: string;
};

export type Fattura = {
  id: string;
  kind: FatturaKind;
  numeroInterno: string;
  anagraficaId: string;
  anagraficaRagioneSociale: string;
  anagraficaCodiceTarga: string;
  dataEmissione: string;
  numeroDocumentoEsterno: string;
  ficId: number | null;
  spedizione: number;
  /** Default false: IVA non applicata alla spedizione. */
  spedizioneIvaApplicata: boolean;
  imponibile: number;
  ivaPercentuale: number;
  imposta: number;
  totale: number;
  statoPagamento: FatturaStatoPagamento;
  ricevuta: FatturaAllegatoMeta | null;
  versione: number;
  documentoStato: FatturaDocumentoStato;
  note: string;
  fatturaCollegataId: string | null;
  riferimentoFatturaEsterno: string;
  righe: FatturaRiga[];
  dilazioni: FatturaDilazione[];
  createdAt: string;
  updatedAt: string;
};

export type FatturaInput = {
  anagraficaId: string;
  anagraficaRagioneSociale: string;
  anagraficaCodiceTarga: string;
  dataEmissione: string;
  numeroDocumentoEsterno?: string;
  ficId?: number | null;
  spedizione: number;
  spedizioneIvaApplicata: boolean;
  ivaPercentuale: number;
  statoPagamento: FatturaStatoPagamento;
  note?: string;
  fatturaCollegataId?: string | null;
  riferimentoFatturaEsterno?: string;
  righe: FatturaRiga[];
  dilazioni?: FatturaDilazione[];
};

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function clampSconto(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

/** Prezzo unitario dopo sconto %. */
export function prezzoScontatoUnitario(
  prezzoUnitario: number,
  scontoPercentuale: number
): number {
  const sconto = clampSconto(scontoPercentuale);
  return roundMoney(prezzoUnitario * (1 - sconto / 100));
}

export function importoRiga(
  quantita: number,
  prezzoUnitario: number,
  scontoPercentuale = 0
): number {
  return roundMoney(
    quantita * prezzoScontatoUnitario(prezzoUnitario, scontoPercentuale)
  );
}

export function calcolaTotaliFattura(input: {
  righe: Array<{
    quantita: number;
    prezzoUnitario: number;
    scontoPercentuale?: number;
  }>;
  spedizione: number;
  spedizioneIvaApplicata?: boolean;
  ivaPercentuale: number;
}): { imponibile: number; baseIva: number; imposta: number; totale: number } {
  const prodotti = input.righe.reduce(
    (sum, r) =>
      sum +
      importoRiga(r.quantita, r.prezzoUnitario, r.scontoPercentuale ?? 0),
    0
  );
  const spedizione = Number(input.spedizione) || 0;
  const imponibile = roundMoney(prodotti + spedizione);
  const baseIva = roundMoney(
    prodotti + (input.spedizioneIvaApplicata ? spedizione : 0)
  );
  const imposta = roundMoney(
    (baseIva * (Number(input.ivaPercentuale) || 0)) / 100
  );
  return {
    imponibile,
    baseIva,
    imposta,
    totale: roundMoney(imponibile + imposta),
  };
}

export function year2FromDate(isoDate: string): string {
  const y = isoDate?.slice(0, 4);
  if (y && /^\d{4}$/.test(y)) return y.slice(2);
  return String(new Date().getFullYear()).slice(-2);
}

/** Data odierna YYYY-MM-DD (locale). */
export function todayIsoDate(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Scadenza futura rispetto a oggi → non ancora saldabile come “pagata” forzata. */
export function isDilazioneFutura(
  dataScadenza: string,
  today = todayIsoDate()
): boolean {
  return dataScadenza > today;
}

/** Rate future: stato sempre da_pagare. */
export function normalizeDilazioneStato(
  dataScadenza: string,
  stato: FatturaStatoPagamento,
  today = todayIsoDate()
): FatturaStatoPagamento {
  if (isDilazioneFutura(dataScadenza, today)) return "da_pagare";
  return stato;
}

/** Se ci sono dilazioni: pagato solo se tutte pagate. */
export function statoPagamentoFromDilazioni(
  dilazioni: Array<{ statoPagamento: FatturaStatoPagamento }>
): FatturaStatoPagamento {
  if (dilazioni.length === 0) return "da_pagare";
  return dilazioni.every((d) => d.statoPagamento === "pagato")
    ? "pagato"
    : "da_pagare";
}

export function emptyFatturaDilazione(
  totaleSuggerito = 0
): FatturaDilazione {
  return {
    dataScadenza: todayIsoDate(),
    importo: Math.max(0, roundMoney(totaleSuggerito)),
    statoPagamento: "da_pagare",
    note: "",
  };
}

export type DilazioniBilancio = {
  sommaDilazioni: number;
  totaleFattura: number;
  differenza: number;
  /** somma < totale (manca da dilazionare) */
  mancante: number;
  /** somma > totale */
  esubero: number;
  equilibrato: boolean;
};

/** Confronto somma rate vs totale fattura (tolleranza 1 cent). */
export function bilancioDilazioni(
  totaleFattura: number,
  importiDilazioni: number[]
): DilazioniBilancio {
  const totale = roundMoney(totaleFattura);
  const somma = roundMoney(
    importiDilazioni.reduce((s, n) => s + (Number(n) || 0), 0)
  );
  const differenza = roundMoney(somma - totale);
  const equilibrato = Math.abs(differenza) < 0.005;
  return {
    sommaDilazioni: somma,
    totaleFattura: totale,
    differenza,
    mancante: equilibrato || differenza >= 0 ? 0 : roundMoney(-differenza),
    esubero: equilibrato || differenza <= 0 ? 0 : differenza,
    equilibrato,
  };
}

/** Ft-26-C001/1 — oppure Nc-26-C001/1 per note di credito. */
export function buildNumeroInternoFattura(input: {
  dataEmissione: string;
  codiceTarga: string;
  seq: number;
  kind?: FatturaKind;
}): string {
  const aa = year2FromDate(input.dataEmissione);
  const targa = input.codiceTarga.trim().toUpperCase() || "X000";
  const seq = Math.max(1, Math.floor(input.seq));
  const prefix = input.kind === "nota_credito" ? "Nc" : "Ft";
  return `${prefix}-${aa}-${targa}/${seq}`;
}

const rigaSchema = z.object({
  id: z.string().optional(),
  prodottoId: z.string().uuid().nullable().optional(),
  codice: z.string().trim().min(1, "Codice prodotto obbligatorio"),
  descrizione: z.string().trim().min(1, "Descrizione obbligatoria"),
  quantita: z.number().positive("Quantità deve essere > 0"),
  prezzoUnitario: z.number().min(0, "Prezzo non valido"),
  scontoPercentuale: z.number().min(0).max(100).optional(),
  importo: z.number().min(0).optional(),
});

const dilazioneSchema = z.object({
  id: z.string().optional(),
  dataScadenza: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data dilazione non valida"),
  importo: z.number().min(0, "Importo dilazione non valido"),
  statoPagamento: z.enum(["pagato", "da_pagare"]),
  note: z.string().optional(),
});

export const fatturaInputSchema = z
  .object({
    anagraficaId: z.string().uuid("Anagrafica non valida"),
    anagraficaRagioneSociale: z.string().trim().min(1),
    anagraficaCodiceTarga: z.string().trim().min(1),
    dataEmissione: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data non valida"),
    numeroDocumentoEsterno: z.string().optional(),
    ficId: z.number().int().positive().nullable().optional(),
    spedizione: z.number().min(0),
    spedizioneIvaApplicata: z.boolean().optional(),
    ivaPercentuale: z.number().min(0).max(100),
    statoPagamento: z.enum(["pagato", "da_pagare"]),
    note: z.string().optional(),
    fatturaCollegataId: z.string().uuid().nullable().optional(),
    riferimentoFatturaEsterno: z.string().optional(),
    righe: z.array(rigaSchema).min(1, "Aggiungi almeno un prodotto"),
    dilazioni: z.array(dilazioneSchema).optional(),
  })
  .transform((v) => {
    const today = todayIsoDate();
    const righe = v.righe.map((r) => {
      const scontoPercentuale = clampSconto(r.scontoPercentuale ?? 0);
      return {
        id: r.id,
        prodottoId: r.prodottoId ?? null,
        codice: r.codice.trim(),
        descrizione: r.descrizione.trim(),
        quantita: r.quantita,
        prezzoUnitario: r.prezzoUnitario,
        scontoPercentuale,
        importo: importoRiga(r.quantita, r.prezzoUnitario, scontoPercentuale),
      };
    });
    const dilazioni = (v.dilazioni ?? []).map((d) => ({
      id: d.id,
      dataScadenza: d.dataScadenza,
      importo: roundMoney(d.importo),
      statoPagamento: normalizeDilazioneStato(
        d.dataScadenza,
        d.statoPagamento,
        today
      ),
      note: (d.note ?? "").trim(),
    }));
    const statoPagamento =
      dilazioni.length > 0
        ? statoPagamentoFromDilazioni(dilazioni)
        : v.statoPagamento;
    return {
      ...v,
      anagraficaRagioneSociale: v.anagraficaRagioneSociale.trim(),
      anagraficaCodiceTarga: v.anagraficaCodiceTarga.trim().toUpperCase(),
      numeroDocumentoEsterno: (v.numeroDocumentoEsterno ?? "").trim(),
      note: (v.note ?? "").trim(),
      fatturaCollegataId: v.fatturaCollegataId ?? null,
      riferimentoFatturaEsterno: (v.riferimentoFatturaEsterno ?? "").trim(),
      ficId: v.ficId ?? null,
      spedizioneIvaApplicata: Boolean(v.spedizioneIvaApplicata),
      statoPagamento,
      righe,
      dilazioni,
    };
  });

function mapRighe(
  righe: Array<FatturaEmessaRigaRow | FatturaRicevutaRigaRow>
): FatturaRiga[] {
  return [...righe]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((r) => ({
      id: r.id,
      prodottoId: r.prodotto_id,
      codice: r.codice,
      descrizione: r.descrizione,
      quantita: Number(r.quantita) || 0,
      prezzoUnitario: Number(r.prezzo_unitario) || 0,
      scontoPercentuale: Number(r.sconto_percentuale) || 0,
      importo: Number(r.importo) || 0,
    }));
}

function mapDilazioni(
  dilazioni: Array<FatturaEmessaDilazioneRow | FatturaRicevutaDilazioneRow>
): FatturaDilazione[] {
  return [...dilazioni]
    .filter((d) => !d.deleted_at)
    .sort((a, b) => {
      if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
      return a.data_scadenza.localeCompare(b.data_scadenza);
    })
    .map((d) => ({
      id: d.id,
      dataScadenza: d.data_scadenza,
      importo: Number(d.importo) || 0,
      statoPagamento: d.stato_pagamento,
      note: d.note ?? "",
    }));
}

export function mapFatturaEmessaRow(
  row: FatturaEmessaRow,
  righe: FatturaEmessaRigaRow[],
  dilazioni: FatturaEmessaDilazioneRow[] = []
): Fattura {
  const isNc =
    row.tipo_documento === "nota_credito" ||
    String(row.numero_interno ?? "").toUpperCase().startsWith("NC-");
  return {
    id: row.id,
    kind: isNc ? "nota_credito" : "emessa",
    numeroInterno: row.numero_interno,
    anagraficaId: row.cliente_id,
    anagraficaRagioneSociale: row.cliente_ragione_sociale,
    anagraficaCodiceTarga: row.cliente_codice_targa,
    dataEmissione: row.data_emissione,
    numeroDocumentoEsterno: row.numero_documento_esterno ?? "",
    ficId: row.fic_id,
    spedizione: Number(row.spedizione) || 0,
    spedizioneIvaApplicata: Boolean(row.spedizione_iva_applicata),
    imponibile: Number(row.imponibile) || 0,
    ivaPercentuale: Number(row.iva_percentuale) || 0,
    imposta: Number(row.imposta) || 0,
    totale: Number(row.totale) || 0,
    statoPagamento: row.stato_pagamento,
    ricevuta: row.ricevuta_storage_path
      ? {
          storagePath: row.ricevuta_storage_path,
          fileName: row.ricevuta_file_name || "ricevuta",
        }
      : null,
    versione: row.versione,
    documentoStato: row.documento_stato,
    note: row.note ?? "",
    fatturaCollegataId: row.fattura_collegata_id ?? null,
    riferimentoFatturaEsterno: row.riferimento_fattura_esterno ?? "",
    righe: mapRighe(righe),
    dilazioni: mapDilazioni(dilazioni),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapFatturaRicevutaRow(
  row: FatturaRicevutaRow,
  righe: FatturaRicevutaRigaRow[],
  dilazioni: FatturaRicevutaDilazioneRow[] = []
): Fattura {
  return {
    id: row.id,
    kind: "ricevuta",
    numeroInterno: row.numero_interno,
    anagraficaId: row.fornitore_id,
    anagraficaRagioneSociale: row.fornitore_ragione_sociale,
    anagraficaCodiceTarga: row.fornitore_codice_targa,
    dataEmissione: row.data_emissione,
    numeroDocumentoEsterno: row.numero_documento_esterno ?? "",
    ficId: row.fic_id,
    spedizione: Number(row.spedizione) || 0,
    spedizioneIvaApplicata: Boolean(row.spedizione_iva_applicata),
    imponibile: Number(row.imponibile) || 0,
    ivaPercentuale: Number(row.iva_percentuale) || 0,
    imposta: Number(row.imposta) || 0,
    totale: Number(row.totale) || 0,
    statoPagamento: row.stato_pagamento,
    ricevuta: row.ricevuta_storage_path
      ? {
          storagePath: row.ricevuta_storage_path,
          fileName: row.ricevuta_file_name || "ricevuta",
        }
      : null,
    versione: row.versione,
    documentoStato: row.documento_stato,
    note: row.note ?? "",
    fatturaCollegataId: null,
    riferimentoFatturaEsterno: "",
    righe: mapRighe(righe),
    dilazioni: mapDilazioni(dilazioni),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function labelStatoPagamento(stato: FatturaStatoPagamento): string {
  return stato === "pagato" ? "Pagato" : "Da pagare";
}

export function formatEuro(value: number): string {
  return value.toLocaleString("it-IT", {
    style: "currency",
    currency: "EUR",
  });
}

export function formatDateIt(isoDate: string | null | undefined): string {
  if (!isoDate) return "—";
  try {
    return new Date(isoDate).toLocaleDateString("it-IT");
  } catch {
    return isoDate;
  }
}

export function emptyFatturaRiga(): FatturaRiga {
  return {
    prodottoId: null,
    codice: "",
    descrizione: "",
    quantita: 1,
    prezzoUnitario: 0,
    scontoPercentuale: 0,
    importo: 0,
  };
}
