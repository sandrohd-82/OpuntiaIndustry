import { z } from "zod";

export const TICKET_BUCKET = "ticket-gestionale";
export const TICKET_MAX_FILE_BYTES = 500 * 1024 * 1024;
export const TICKET_MAX_FILE_PER_MSG = 20;

export const TICKET_CATEGORIE = ["bug", "funzioni", "miglioramenti"] as const;
export type TicketCategoria = (typeof TICKET_CATEGORIE)[number];

export const TICKET_URGENZE = [
  "non_urgente",
  "poco_urgente",
  "urgente",
] as const;
export type TicketUrgenza = (typeof TICKET_URGENZE)[number];

export const TICKET_STATI = [
  "bozza",
  "in_carico",
  "risolto",
  "archiviato",
] as const;
export type TicketDocumentoStato = (typeof TICKET_STATI)[number];

export const TICKET_CATEGORIA_META: Record<
  TicketCategoria,
  { label: string; hint: string; icon: "bug" | "funzioni" | "miglioramenti" }
> = {
  bug: {
    label: "BUG",
    hint: "Malfunzionamenti",
    icon: "bug",
  },
  funzioni: {
    label: "Funzioni",
    hint: "Particolari funzioni (es. dopo la fattura inviala anche via e-mail)",
    icon: "funzioni",
  },
  miglioramenti: {
    label: "Miglioramenti",
    hint: "Migliorie e consigli su nuove funzioni",
    icon: "miglioramenti",
  },
};

export const TICKET_URGENZA_META: Record<
  TicketUrgenza,
  { label: string; classe: string }
> = {
  non_urgente: {
    label: "Non urgente",
    classe: "bg-sky-100 text-sky-900 border-sky-300",
  },
  poco_urgente: {
    label: "Poco urgente",
    classe: "bg-amber-100 text-amber-950 border-amber-300",
  },
  urgente: {
    label: "Urgente",
    classe: "bg-red-100 text-red-900 border-red-400",
  },
};

export const TICKET_STATO_LABEL: Record<TicketDocumentoStato, string> = {
  bozza: "Inserito",
  in_carico: "In carico",
  risolto: "Risolto",
  archiviato: "Archiviato",
};

export const TICKET_CHAT_PLACEHOLDER =
  "Scrivi un testo, invia un vocale o allega un file";

export type TicketFile = {
  id: string;
  ticketId: string;
  messaggioId: string | null;
  storagePath: string;
  fileName: string;
  mime: string;
  fileSize: number;
  kind: "allegato" | "vocale" | "immagine";
  url: string | null;
  createdAt: string;
};

export type TicketMessaggio = {
  id: string;
  ticketId: string;
  contenuto: string;
  tipo: "testo" | "vocale" | "file" | "misto";
  createdBy: string | null;
  autoreNome: string;
  createdAt: string;
  files: TicketFile[];
};

export type TicketRiga = {
  id: string;
  codice: string;
  categoria: TicketCategoria;
  urgenza: TicketUrgenza;
  titolo: string;
  descrizione: string;
  documentoStato: TicketDocumentoStato;
  versione: number;
  createdBy: string | null;
  autoreNome: string;
  createdAt: string;
  updatedAt: string;
  archiviatoAt: string | null;
  resolvedAt: string | null;
  messaggiCount: number;
};

export type TicketScheda = TicketRiga & {
  messaggi: TicketMessaggio[];
};

export const ticketCreaSchema = z.object({
  categoria: z.enum(TICKET_CATEGORIE),
  urgenza: z.enum(TICKET_URGENZE),
  descrizione: z.string().trim().max(8000),
});

export const ticketMessaggioSchema = z.object({
  ticketId: z.string().uuid(),
  contenuto: z.string().trim().max(8000),
});

export function titoloDaDescrizione(testo: string): string {
  const t = testo.replace(/\s+/g, " ").trim();
  if (!t) return "Ticket";
  return t.length > 80 ? `${t.slice(0, 77)}…` : t;
}

const MIME_DA_EXT: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  bmp: "image/bmp",
  heic: "image/heic",
  heif: "image/heif",
  webm: "audio/webm",
  ogg: "audio/ogg",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  m4a: "audio/mp4",
  zip: "application/zip",
  txt: "text/plain",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

export function extDaNome(name: string): string {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

export function mimeDaFile(name: string, mime: string): string {
  const raw = (mime || "").split(";")[0].trim().toLowerCase();
  if (raw && raw !== "application/octet-stream") {
    if (raw === "image/jpg" || raw === "image/pjpeg") return "image/jpeg";
    if (raw === "image/x-png") return "image/png";
    return raw;
  }
  return MIME_DA_EXT[extDaNome(name)] ?? raw;
}

export function kindDaMime(
  mime: string,
  name = ""
): "allegato" | "vocale" | "immagine" {
  const m = mimeDaFile(name, mime);
  if (m.startsWith("audio/") || /\.(webm|ogg|mp3|wav|m4a)$/i.test(name)) {
    return "vocale";
  }
  if (m.startsWith("image/") || /\.(jpe?g|png|gif|webp|bmp|heic|heif)$/i.test(name)) {
    return "immagine";
  }
  return "allegato";
}

export function extDaNomeOMime(name: string, mime: string): string {
  const fromName = extDaNome(name);
  if (fromName && fromName.length <= 8 && /^[a-z0-9]+$/.test(fromName)) {
    return fromName;
  }
  const m = mimeDaFile(name, mime);
  if (m === "audio/webm") return "webm";
  if (m === "image/jpeg") return "jpg";
  if (m === "image/png") return "png";
  if (m === "application/pdf") return "pdf";
  return "bin";
}

export function isPdfFile(mime: string, name = ""): boolean {
  return mimeDaFile(name, mime) === "application/pdf" || /\.pdf$/i.test(name);
}

export function mimeAmmesso(_mime: string, _name = ""): boolean {
  return true;
}

export function formatBytesTicket(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
