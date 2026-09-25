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

export const anagraficaDocumentoMetaSchema = z.object({
  clienteId: z.string().uuid(),
  tipo: z.enum(ANAGRAFICA_DOCUMENTO_TIPI),
  titolo: z.string().trim().min(2).max(200),
  note: z.string().trim().max(2000).optional().default(""),
});
