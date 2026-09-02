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

export type OrdineTipoPagamento =
  | "anticipato"
  | "alla_consegna"
  | "posticipato"
  | "dilazionato";

export const ORDINE_TIPI_PAGAMENTO: {
  value: OrdineTipoPagamento;
  label: string;
}[] = [
  { value: "anticipato", label: "Anticipato" },
  { value: "alla_consegna", label: "Alla consegna" },
  { value: "posticipato", label: "Posticipato" },
  { value: "dilazionato", label: "Dilazionato" },
];

export function labelTipoPagamento(value: OrdineTipoPagamento): string {
  return (
    ORDINE_TIPI_PAGAMENTO.find((t) => t.value === value)?.label ?? value
  );
}

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
  dataDisponibilitaPresunta: string | null;
  stato: OrdineStato;
  origineStorico: OrdineOrigineStorico | null;
  sourceOrdineId: string | null;
  trasporto: OrdineTrasporto;
  importoEuro: number;
  note: string;
  tipoPagamento: OrdineTipoPagamento;
  pagato: boolean;
  dataPagamento: string | null;
  noteRateizzazione: string;
  ricevutaPagamento: OrdineAllegatoMeta | null;
  offerta: OrdineAllegatoMeta | null;
  ordineClienteDoc: OrdineAllegatoMeta | null;
  versione: number;
  documentoStato: OrdineDocumentoStato;
  consegnaTipo: "asap" | "data" | null;
  urgente: boolean;
  usaMagazzino: boolean;
  usaSabato: boolean;
  dataConsegnaStimata: string | null;
  capacitaSnapshot: Record<string, unknown>;
  isTest: boolean;
  righe: OrdineRigaProdotto[];
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  updatedBy: string | null;
  createdByLabel: string | null;
  updatedByLabel: string | null;
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

export const ordineInputSchema = z
  .object({
    clienteId: z.string().uuid("Cliente non valido"),
    cliente: z.string().trim().min(1),
    codiceTargaCliente: z
      .string()
      .regex(/^C[0-9A-F]{3}$/, "Targa cliente non valida"),
    dataOrdine: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    dataConsegna: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .optional(),
    numeroInterno: z.string().trim().min(3).optional(),
    numeroCliente: z.string().optional(),
    stato: z.enum(["ricevuto", "sospeso", "evaso", "storico"]),
    origineStorico: z.enum(["manuale", "chiusura"]).nullable().optional(),
    note: z.string().optional(),
    tipoPagamento: z.enum([
      "anticipato",
      "alla_consegna",
      "posticipato",
      "dilazionato",
    ]),
    pagato: z.boolean(),
    dataPagamento: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .optional(),
    noteRateizzazione: z.string().optional(),
    trasporto: z.object({
      azienda: z.string(),
      imponibile: z.number().min(0),
      ivaPercentuale: z.number().min(0),
    }),
    righe: z.array(rigaSchema).min(1, "Aggiungi almeno una riga prodotto"),
  })
  .superRefine((val, ctx) => {
    if (val.pagato && !val.dataPagamento) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Se l’ordine è pagato, indica la data pagamento.",
        path: ["dataPagamento"],
      });
    }
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
  righe: OrdineRigaRow[] = [],
  operatorLabels: Map<string, string> = new Map()
): Ordine {
  const tipo = (row.tipo_pagamento ?? "alla_consegna") as OrdineTipoPagamento;
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
    dataDisponibilitaPresunta: row.data_disponibilita_presunta ?? null,
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
    tipoPagamento: tipo,
    pagato: Boolean(row.pagato),
    dataPagamento: row.data_pagamento,
    noteRateizzazione: row.note_rateizzazione ?? "",
    ricevutaPagamento: allegatoFromRow(
      row.ricevuta_pagamento_storage_path,
      row.ricevuta_pagamento_file_name
    ),
    offerta: allegatoFromRow(row.offerta_storage_path, row.offerta_file_name),
    ordineClienteDoc: allegatoFromRow(
      row.ordine_cliente_storage_path,
      row.ordine_cliente_file_name
    ),
    versione: row.versione,
    documentoStato: row.documento_stato,
    consegnaTipo: (row.consegna_tipo as "asap" | "data" | null) ?? null,
    urgente: Boolean(row.urgente),
    usaMagazzino: Boolean(row.usa_magazzino),
    usaSabato: Boolean(row.usa_sabato),
    dataConsegnaStimata: row.data_consegna_stimata ?? null,
    capacitaSnapshot:
      (row.capacita_snapshot as Record<string, unknown> | null) ?? {},
    isTest: row.is_test !== false,
    righe: [...righe]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(mapOrdineRigaRow),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdByLabel: row.created_by
      ? (operatorLabels.get(row.created_by) ?? null)
      : null,
    updatedByLabel: row.updated_by
      ? (operatorLabels.get(row.updated_by) ?? null)
      : null,
    deletedAt: row.deleted_at,
  };
}

/** Formato audit: "S. Incorvaia" */
export function formatOperatoreShort(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
  fallback: string | null | undefined = null
): string {
  const first = (firstName ?? "").trim();
  const last = (lastName ?? "").trim();
  if (first && last) return `${first.charAt(0).toUpperCase()}. ${last}`;
  if (last) return last;
  if (first) return first;
  const fb = (fallback ?? "").trim();
  if (!fb) return "Operatore non registrato";
  const parts = fb.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0].charAt(0).toUpperCase()}. ${parts.slice(1).join(" ")}`;
  }
  return fb;
}

export function formatOperatoreQuando(
  label: string | null | undefined,
  isoDate: string | null | undefined
): string {
  const when = isoDate
    ? new Date(isoDate).toLocaleString("it-IT", {
        dateStyle: "short",
        timeStyle: "short",
      })
    : "—";
  const who = label?.trim() || "Operatore non registrato";
  return `${who} · ${when}`;
}

export function labelDocumentoStato(stato: OrdineDocumentoStato): string {
  switch (stato) {
    case "bozza":
      return "bozza";
    case "registrato":
      return "registrato";
    case "approvato":
      return "approvato";
    case "chiuso":
      return "chiuso";
    default:
      return stato;
  }
}

export type OrdineAuditEntry = {
  id: string;
  action: string;
  actionLabel: string;
  summary: string;
  actorLabel: string;
  createdAt: string;
  payload: Record<string, unknown>;
};

export function labelAuditAction(action: string): string {
  switch (action) {
    case "create":
      return "Creazione";
    case "update":
      return "Modifica";
    case "soft_delete":
      return "Eliminazione";
    case "restore":
      return "Ripristino";
    case "status_change":
      return "Cambio stato";
    case "attachment_upload":
      return "Allegato caricato";
    case "attachment_remove":
      return "Allegato rimosso";
    case "purge_test_ordini":
      return "Pulizia dati test ordini";
    default:
      return action;
  }
}
