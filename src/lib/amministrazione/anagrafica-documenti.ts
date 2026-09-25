import { z } from "zod";

export const ANAGRAFICA_DOCUMENTI_BUCKET = "anagrafica-documenti";
export const ANAGRAFICA_DOCUMENTI_MAX_BYTES = 20 * 1024 * 1024;

export const ANAGRAFICA_DOCUMENTO_TIPI = [
  "contratto",
  "concordato",
  "meeting_resume",
  "nda",
  "altro",
] as const;

export type AnagraficaDocumentoTipo =
  (typeof ANAGRAFICA_DOCUMENTO_TIPI)[number];

export const ANAGRAFICA_DOCUMENTO_TIPO_LABEL: Record<
  AnagraficaDocumentoTipo,
  string
> = {
  contratto: "Contratto",
  concordato: "Concordato",
  meeting_resume: "Resume meeting",
  nda: "NDA",
  altro: "Altro",
};

export const ANAGRAFICA_DOCUMENTO_STATI = [
  "bozza",
  "approvato",
  "chiuso",
] as const;

export type AnagraficaDocumentoStato =
  (typeof ANAGRAFICA_DOCUMENTO_STATI)[number];

export const ANAGRAFICA_DOCUMENTO_STATO_LABEL: Record<
  AnagraficaDocumentoStato,
  string
> = {
  bozza: "Bozza",
  approvato: "Approvato",
  chiuso: "Chiuso",
};

export const ANAGRAFICA_DOCUMENTI_MIME = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

const MIME_BY_EXT: Record<string, (typeof ANAGRAFICA_DOCUMENTI_MIME)[number]> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export function mimeFromFileName(
  name: string,
  declared: string
): (typeof ANAGRAFICA_DOCUMENTI_MIME)[number] | null {
  const trimmed = declared.trim().toLowerCase();
  if (
    (ANAGRAFICA_DOCUMENTI_MIME as readonly string[]).includes(trimmed)
  ) {
    return trimmed as (typeof ANAGRAFICA_DOCUMENTI_MIME)[number];
  }
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return MIME_BY_EXT[ext] ?? null;
}

export function extFromMime(mime: string): string {
  switch (mime) {
    case "application/msword":
      return "doc";
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      return "docx";
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    default:
      return "pdf";
  }
}

export const ANAGRAFICA_DOCUMENTO_ORIGINI = [
  "non_specificato",
  "mail",
  "altro",
] as const;

export type AnagraficaDocumentoOrigine =
  (typeof ANAGRAFICA_DOCUMENTO_ORIGINI)[number];

export const ANAGRAFICA_DOCUMENTO_ORIGINE_LABEL: Record<
  AnagraficaDocumentoOrigine,
  string
> = {
  non_specificato: "Non specificato",
  mail: "Ricevuto via mail",
  altro: "Altro",
};

export type AnagraficaDocumento = {
  id: string;
  clienteId: string;
  tipo: AnagraficaDocumentoTipo;
  titolo: string;
  note: string;
  storagePath: string;
  fileName: string;
  mime: string;
  fileSize: number;
  versione: number;
  documentoStato: AnagraficaDocumentoStato;
  dataDocumento: string | null;
  dataScadenza: string | null;
  ricevutoVia: AnagraficaDocumentoOrigine;
  webmailMessaggioId: string | null;
  collegamentoEtichetta: string;
  collegamentoUrl: string;
  approvedBy: string | null;
  approvedAt: string | null;
  createdBy: string | null;
  createdAt: string;
  url: string | null;
};

export type ClienteSchedaOrdineSlim = {
  id: string;
  numeroInterno: string;
  dataOrdine: string;
  stato: string;
  tipo: string;
  importoEuro: number;
};

export type ClienteSchedaFatturaSlim = {
  id: string;
  numeroInterno: string;
  dataEmissione: string;
  totale: number;
  statoPagamento: string;
  tipoDocumento: string;
};

const optionalIsoDate = z
  .string()
  .trim()
  .max(10)
  .optional()
  .default("")
  .refine((v) => !v || /^\d{4}-\d{2}-\d{2}$/.test(v), "Data non valida.");

export const anagraficaDocumentoMetaSchema = z
  .object({
    clienteId: z.string().uuid(),
    tipo: z.enum(ANAGRAFICA_DOCUMENTO_TIPI),
    titolo: z.string().trim().min(2).max(200),
    note: z.string().trim().max(2000).optional().default(""),
    dataDocumento: optionalIsoDate,
    dataScadenza: optionalIsoDate,
    ricevutoVia: z
      .enum(ANAGRAFICA_DOCUMENTO_ORIGINI)
      .optional()
      .default("non_specificato"),
    webmailMessaggioId: z
      .string()
      .trim()
      .optional()
      .default("")
      .refine(
        (v) => !v || z.string().uuid().safeParse(v).success,
        "Mail collegata non valida."
      ),
    collegamentoEtichetta: z.string().trim().max(300).optional().default(""),
    collegamentoUrl: z.string().trim().max(500).optional().default(""),
  })
  .refine(
    (v) =>
      !v.dataDocumento ||
      !v.dataScadenza ||
      v.dataScadenza >= v.dataDocumento,
    { message: "La scadenza non può precedere la data del documento.", path: ["dataScadenza"] }
  );

export function optionalDateOrNull(value: string | undefined): string | null {
  const v = String(value ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

export function formatAnagraficaIsoDate(iso: string | null | undefined): string {
  const v = String(iso ?? "").slice(0, 10);
  const [y, m, d] = v.split("-");
  return y && m && d ? `${d}/${m}/${y}` : "";
}

export function isAnagraficaScadenzaPassata(iso: string | null | undefined): boolean {
  const v = String(iso ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const today = new Date();
  const ymd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  return v < ymd;
}
