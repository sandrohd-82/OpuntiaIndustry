import { z } from "zod";

export const DOCUMENTAZIONI_BUCKET = "documentazioni-aziendali";
export const DOCUMENTAZIONI_MAX_FILE_BYTES = 15 * 1024 * 1024;
export const DOCUMENTAZIONI_MAX_FILE_PER_VERSIONE = 30;

export const DOCUMENTAZIONI_MIME = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type DocumentazioneStatoOperativo =
  | "in_attesa"
  | "in_carico"
  | "scaduto";

export type DocumentazioneDocumentoStato = "bozza" | "approvato" | "chiuso";

export type DocumentazioneFile = {
  id: string;
  documentazioneId: string;
  versione: number;
  storagePath: string;
  fileName: string;
  mime: string;
  fileSize: number;
  sortOrder: number;
  url: string | null;
  createdAt: string;
};

export type DocumentazioneVersione = {
  id: string;
  documentazioneId: string;
  versione: number;
  nome: string;
  repartoId: string | null;
  repartoNome: string;
  spiegazione: string;
  dataInizio: string;
  dataScadenza: string;
  necessitaRinnovo: boolean;
  statoOperativo: DocumentazioneStatoOperativo;
  documentoStato: DocumentazioneDocumentoStato;
  rinnovatoAt: string;
  files: DocumentazioneFile[];
};

export type DocumentazioneScheda = {
  id: string;
  codice: string;
  nome: string;
  repartoId: string;
  repartoNome: string;
  spiegazione: string;
  dataInizio: string;
  dataScadenza: string;
  necessitaRinnovo: boolean;
  statoOperativo: DocumentazioneStatoOperativo;
  documentoStato: DocumentazioneDocumentoStato;
  versione: number;
  approvedBy: string | null;
  approvedAt: string | null;
  archiviatoAt: string | null;
  archiviatoBy: string | null;
  createdAt: string;
  updatedAt: string;
  files: DocumentazioneFile[];
  versioni: DocumentazioneVersione[];
};

export type DocumentazioneRepartoOpt = {
  id: string;
  codice: string;
  nome: string;
};

const dateOnly = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data non valida.");

export const documentazioneInputSchema = z
  .object({
    nome: z.string().trim().min(1, "Nome obbligatorio.").max(200),
    repartoId: z.string().uuid("Seleziona un reparto."),
    spiegazione: z.string().trim().max(8000).optional().default(""),
    dataInizio: dateOnly,
    dataScadenza: dateOnly,
    necessitaRinnovo: z.boolean().optional().default(false),
  })
  .superRefine((v, ctx) => {
    if (v.dataScadenza < v.dataInizio) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "La scadenza non può precedere l’inizio.",
        path: ["dataScadenza"],
      });
    }
  });

export const documentazioneUpdateSchema = documentazioneInputSchema.extend({
  id: z.string().uuid(),
});

export const documentazioneRinnovoSchema = z
  .object({
    id: z.string().uuid(),
    dataInizio: dateOnly,
    dataScadenza: dateOnly,
    spiegazione: z.string().trim().max(8000).optional(),
    necessitaRinnovo: z.boolean().optional().default(true),
    copiaFile: z.boolean().optional().default(true),
  })
  .superRefine((v, ctx) => {
    if (v.dataScadenza < v.dataInizio) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "La scadenza non può precedere l’inizio.",
        path: ["dataScadenza"],
      });
    }
  });

export function statoOperativoLabel(
  stato: DocumentazioneStatoOperativo
): string {
  if (stato === "in_attesa") return "In attesa";
  if (stato === "in_carico") return "In carico";
  return "Scaduto";
}

export function documentoStatoLabel(stato: DocumentazioneDocumentoStato): string {
  if (stato === "bozza") return "Bozza";
  if (stato === "approvato") return "Approvato";
  return "Chiuso";
}

export function formatDateDoc(iso: string | null | undefined): string {
  if (!iso) return "—";
  const raw = iso.slice(0, 10);
  const [y, m, d] = raw.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

export function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const dt = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export function suggestedRinnovoDates(
  dataInizio: string,
  dataScadenza: string
): { dataInizio: string; dataScadenza: string } {
  const start = new Date(`${dataInizio.slice(0, 10)}T00:00:00Z`);
  const end = new Date(`${dataScadenza.slice(0, 10)}T00:00:00Z`);
  const duration = Math.max(
    1,
    Math.round((end.getTime() - start.getTime()) / 86_400_000)
  );
  const nextStart = addDaysIso(dataScadenza, 1);
  return {
    dataInizio: nextStart,
    dataScadenza: addDaysIso(nextStart, duration),
  };
}

export function extFromMime(mime: string): string {
  if (mime === "application/pdf") return "pdf";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "jpg";
}

export function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function isScadutaByDate(dataScadenza: string, today = todayIsoDate()) {
  return dataScadenza.slice(0, 10) < today;
}
