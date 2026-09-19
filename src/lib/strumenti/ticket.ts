import { z } from "zod";

export const TICKET_BUCKET = "ticket-gestionale";
export const TICKET_MAX_FILE_BYTES = 15 * 1024 * 1024;
export const TICKET_MAX_FILE_PER_MSG = 8;

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
  bozza: "Bozza",
  in_carico: "In carico",
  risolto: "Risolto",
  archiviato: "Archiviato",
};

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

export function kindDaMime(mime: string): "allegato" | "vocale" | "immagine" {
  if (mime.startsWith("audio/")) return "vocale";
  if (mime.startsWith("image/")) return "immagine";
  return "allegato";
}

export function extDaNomeOMime(name: string, mime: string): string {
  const fromName = name.split(".").pop()?.toLowerCase() ?? "";
  if (fromName && fromName.length <= 8 && /^[a-z0-9]+$/.test(fromName)) {
    return fromName;
  }
  if (mime === "audio/webm") return "webm";
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "application/pdf") return "pdf";
  return "bin";
}

export function mimeAmmesso(mime: string): boolean {
  if (!mime) return false;
  if (mime.startsWith("image/")) return true;
  if (mime.startsWith("audio/")) return true;
  return (
    mime === "application/pdf" ||
    mime === "text/plain" ||
    mime === "application/zip" ||
    mime ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    mime ===
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
}
