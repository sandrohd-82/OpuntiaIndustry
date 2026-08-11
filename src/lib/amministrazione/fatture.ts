import { z } from "zod";
import type {
  FatturaDocumentoStato,
  FatturaEmessaRigaRow,
  FatturaEmessaRow,
  FatturaRicevutaRigaRow,
  FatturaRicevutaRow,
  FatturaStatoPagamento,
} from "@/types/database";

export type FatturaKind = "emessa" | "ricevuta";

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
  prezzoUnitario: number;
  importo: number;
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
  imponibile: number;
  ivaPercentuale: number;
  imposta: number;
  totale: number;
  statoPagamento: FatturaStatoPagamento;
  ricevuta: FatturaAllegatoMeta | null;
  versione: number;
  documentoStato: FatturaDocumentoStato;
  note: string;
  righe: FatturaRiga[];
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
  ivaPercentuale: number;
  statoPagamento: FatturaStatoPagamento;
  note?: string;
  righe: FatturaRiga[];
};

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function importoRiga(quantita: number, prezzoUnitario: number): number {
  return roundMoney(quantita * prezzoUnitario);
}

export function calcolaTotaliFattura(input: {
  righe: Array<{ quantita: number; prezzoUnitario: number }>;
  spedizione: number;
  ivaPercentuale: number;
}): { imponibile: number; imposta: number; totale: number } {
  const prodotti = input.righe.reduce(
    (sum, r) => sum + importoRiga(r.quantita, r.prezzoUnitario),
    0
  );
  const imponibile = roundMoney(prodotti + (Number(input.spedizione) || 0));
  const imposta = roundMoney(
    (imponibile * (Number(input.ivaPercentuale) || 0)) / 100
  );
  return {
    imponibile,
    imposta,
    totale: roundMoney(imponibile + imposta),
  };
}

export function year2FromDate(isoDate: string): string {
  const y = isoDate?.slice(0, 4);
  if (y && /^\d{4}$/.test(y)) return y.slice(2);
  return String(new Date().getFullYear()).slice(-2);
}

/** Ft-26-C001/1 */
export function buildNumeroInternoFattura(input: {
  dataEmissione: string;
  codiceTarga: string;
  seq: number;
}): string {
  const aa = year2FromDate(input.dataEmissione);
  const targa = input.codiceTarga.trim().toUpperCase() || "X000";
  const seq = Math.max(1, Math.floor(input.seq));
  return `Ft-${aa}-${targa}/${seq}`;
}

const rigaSchema = z.object({
  id: z.string().optional(),
  prodottoId: z.string().uuid().nullable().optional(),
  codice: z.string().trim().min(1, "Codice prodotto obbligatorio"),
  descrizione: z.string().trim().min(1, "Descrizione obbligatoria"),
  quantita: z.number().positive("Quantità deve essere > 0"),
  prezzoUnitario: z.number().min(0, "Prezzo non valido"),
  importo: z.number().min(0).optional(),
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
    ivaPercentuale: z.number().min(0).max(100),
    statoPagamento: z.enum(["pagato", "da_pagare"]),
    note: z.string().optional(),
    righe: z.array(rigaSchema).min(1, "Aggiungi almeno un prodotto"),
  })
  .transform((v) => {
    const righe = v.righe.map((r) => ({
      id: r.id,
      prodottoId: r.prodottoId ?? null,
      codice: r.codice.trim(),
      descrizione: r.descrizione.trim(),
      quantita: r.quantita,
      prezzoUnitario: r.prezzoUnitario,
      importo: importoRiga(r.quantita, r.prezzoUnitario),
    }));
    return {
      ...v,
      anagraficaRagioneSociale: v.anagraficaRagioneSociale.trim(),
      anagraficaCodiceTarga: v.anagraficaCodiceTarga.trim().toUpperCase(),
      numeroDocumentoEsterno: (v.numeroDocumentoEsterno ?? "").trim(),
      note: (v.note ?? "").trim(),
      ficId: v.ficId ?? null,
      righe,
    };
  });

export function mapFatturaEmessaRow(
  row: FatturaEmessaRow,
  righe: FatturaEmessaRigaRow[]
): Fattura {
  return {
    id: row.id,
    kind: "emessa",
    numeroInterno: row.numero_interno,
    anagraficaId: row.cliente_id,
    anagraficaRagioneSociale: row.cliente_ragione_sociale,
    anagraficaCodiceTarga: row.cliente_codice_targa,
    dataEmissione: row.data_emissione,
    numeroDocumentoEsterno: row.numero_documento_esterno ?? "",
    ficId: row.fic_id,
    spedizione: Number(row.spedizione) || 0,
    imponibile: Number(row.imponibile) || 0,
    ivaPercentuale: Number(row.iva_percentuale) || 0,
    imposta: Number(row.imposta) || 0,
    totale: Number(row.totale) || 0,
    statoPagamento: row.stato_pagamento,
    ricevuta:
      row.ricevuta_storage_path
        ? {
            storagePath: row.ricevuta_storage_path,
            fileName: row.ricevuta_file_name || "ricevuta",
          }
        : null,
    versione: row.versione,
    documentoStato: row.documento_stato,
    note: row.note ?? "",
    righe: [...righe]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((r) => ({
        id: r.id,
        prodottoId: r.prodotto_id,
        codice: r.codice,
        descrizione: r.descrizione,
        quantita: Number(r.quantita) || 0,
        prezzoUnitario: Number(r.prezzo_unitario) || 0,
        importo: Number(r.importo) || 0,
      })),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapFatturaRicevutaRow(
  row: FatturaRicevutaRow,
  righe: FatturaRicevutaRigaRow[]
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
    imponibile: Number(row.imponibile) || 0,
    ivaPercentuale: Number(row.iva_percentuale) || 0,
    imposta: Number(row.imposta) || 0,
    totale: Number(row.totale) || 0,
    statoPagamento: row.stato_pagamento,
    ricevuta:
      row.ricevuta_storage_path
        ? {
            storagePath: row.ricevuta_storage_path,
            fileName: row.ricevuta_file_name || "ricevuta",
          }
        : null,
    versione: row.versione,
    documentoStato: row.documento_stato,
    note: row.note ?? "",
    righe: [...righe]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((r) => ({
        id: r.id,
        prodottoId: r.prodotto_id,
        codice: r.codice,
        descrizione: r.descrizione,
        quantita: Number(r.quantita) || 0,
        prezzoUnitario: Number(r.prezzo_unitario) || 0,
        importo: Number(r.importo) || 0,
      })),
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
    importo: 0,
  };
}
