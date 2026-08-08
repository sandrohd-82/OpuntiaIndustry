import { z } from "zod";
import type {
  OrdineRigaRow,
  OrdineRow,
  OrdineStato,
} from "@/types/database";

export type OrdineAllegatoMeta = {
  storagePath: string;
  fileName: string;
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

export type OrdineOrigineStorico = "manuale" | "chiusura";
export type OrdineDocumentoStato =
  | "bozza"
  | "registrato"
  | "approvato"
  | "chiuso";

export type Ordine = {
  id: string;
  numeroInterno: string;
  /** Alias UI legacy */
  numero: string;
  numeroCliente: string;
  clienteId: string | null;
  cliente: string;
  clienteCodiceTarga: string;
  dataOrdine: string;
  dataConsegna: string | null;
  stato: OrdineStato;
  origineStorico: OrdineOrigineStorico | null;
  sourceOrdineId: string | null;
  trasporto: OrdineTrasporto;
  importoEuro: number;
  note: string;
  offerta: OrdineAllegatoMeta | null;
  ordineClienteDoc: OrdineAllegatoMeta | null;
  versione: number;
  documentoStato: OrdineDocumentoStato;
  righe: OrdineRigaProdotto[];
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  updatedBy: string | null;
  deletedAt: string | null;
};

export const IVA_PERCENTUALI_COMUNI = [4, 5, 10, 22] as const;
export const ORDINI_ALLEGATI_BUCKET = "ordini-allegati";

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

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
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

export function year2FromDataOrdine(dataOrdine: string): string {
  const y = dataOrdine?.slice(0, 4);
  if (y && /^\d{4}$/.test(y)) return y.slice(2);
  return String(new Date().getFullYear()).slice(-2);
}

export function buildNumeroInternoOrdine(input: {
  dataOrdine: string;
  codiceTargaCliente: string;
  seq: number;
}): string {
  const aa = year2FromDataOrdine(input.dataOrdine);
  const targa = input.codiceTargaCliente.trim().toUpperCase() || "C000";
  const seq = Math.max(1, Math.floor(input.seq));
  return `Or-${aa}-${targa}/${seq}`;
}

export function fraseConfermaEliminazione(numeroInterno: string): string {
  return `Elimina ${numeroInterno.trim()}`;
}

const rigaSchema = z.object({
  id: z.string().optional(),
  prodottoId: z.string().min(1, "Prodotto obbligatorio"),
  prodottoCodice: z.string(),
  prodottoNome: z.string(),
  quantita: z.number().positive("Quantità deve essere > 0"),
  prezzoUnitario: z.number().min(0),
  ivaPercentuale: z.number().min(0),
});

export const ordineInputSchema = z.object({
  clienteId: z.string().uuid("Cliente non valido"),
  cliente: z.string().trim().min(1),
  codiceTargaCliente: z.string().regex(/^C[0-9A-F]{3}$/, "Targa cliente non valida"),
  dataOrdine: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dataConsegna: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  numeroInterno: z.string().trim().min(3).optional(),
  numeroCliente: z.string().optional(),
  stato: z.enum(["ricevuto", "evaso", "storico"]),
  origineStorico: z.enum(["manuale", "chiusura"]).nullable().optional(),
  note: z.string().optional(),
  trasporto: z.object({
    azienda: z.string(),
    imponibile: z.number().min(0),
    ivaPercentuale: z.number().min(0),
  }),
  righe: z.array(rigaSchema).min(1, "Aggiungi almeno una riga prodotto"),
});

export type OrdineInput = z.infer<typeof ordineInputSchema>;

function allegatoFromRow(
  path: string,
  name: string
): OrdineAllegatoMeta | null {
  if (!path?.trim()) return null;
  return { storagePath: path, fileName: name || path.split("/").pop() || "file" };
}

export function mapOrdineRigaRow(row: OrdineRigaRow): OrdineRigaProdotto {
  return {
    id: row.id,
    prodottoId: row.prodotto_id ?? "",
    prodottoCodice: row.prodotto_codice,
    prodottoNome: row.prodotto_nome,
    quantita: Number(row.quantita),
    prezzoUnitario: Number(row.prezzo_unitario),
    ivaPercentuale: Number(row.iva_percentuale),
  };
}

export function mapOrdineRow(
  row: OrdineRow,
  righe: OrdineRigaRow[] = []
): Ordine {
  return {
    id: row.id,
    numeroInterno: row.numero_interno,
    numero: row.numero_interno,
    numeroCliente: row.numero_cliente ?? "",
    clienteId: row.cliente_id,
    cliente: row.cliente_ragione_sociale,
    clienteCodiceTarga: row.cliente_codice_targa,
    dataOrdine: row.data_ordine,
    dataConsegna: row.data_consegna,
    stato: row.stato,
    origineStorico: row.origine_storico,
    sourceOrdineId: row.source_ordine_id,
    trasporto: {
      azienda: row.trasporto_azienda,
      imponibile: Number(row.trasporto_imponibile),
      ivaPercentuale: Number(row.trasporto_iva_percentuale),
    },
    importoEuro: Number(row.importo_euro),
    note: row.note ?? "",
    offerta: allegatoFromRow(row.offerta_storage_path, row.offerta_file_name),
    ordineClienteDoc: allegatoFromRow(
      row.ordine_cliente_storage_path,
      row.ordine_cliente_file_name
    ),
    versione: row.versione,
    documentoStato: row.documento_stato,
    righe: [...righe]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(mapOrdineRigaRow),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    deletedAt: row.deleted_at,
  };
}
