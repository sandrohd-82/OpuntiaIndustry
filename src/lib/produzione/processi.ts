import { z } from "zod";

export const PROCESSO_DOCUMENTO_STATI = [
  "bozza",
  "approvato",
  "chiuso",
] as const;

export type ProcessoDocumentoStato = (typeof PROCESSO_DOCUMENTO_STATI)[number];

export type ProcessoAttivita = {
  id: string;
  codice: string;
  nome: string;
  descrizione: string;
  attivo: boolean;
  note: string;
  createdAt: string;
};

export type Processo = {
  id: string;
  codice: string;
  nome: string;
  descrizione: string;
  attivo: boolean;
  note: string;
  versione: number;
  documentoStato: ProcessoDocumentoStato;
  approvatoAt: string | null;
  approvatoBy: string | null;
  createdAt: string;
  passiCount: number;
};

export type ProcessoPasso = {
  id: string;
  processoId: string;
  attivitaId: string;
  sortOrder: number;
  obbligatorio: boolean;
  note: string;
  attivitaCodice: string;
  attivitaNome: string;
};

export const processoAttivitaInputSchema = z.object({
  codice: z.string().trim().min(1, "Codice obbligatorio.").max(64),
  nome: z.string().trim().min(1, "Nome obbligatorio.").max(200),
  descrizione: z.string().trim().max(2000).optional().default(""),
  note: z.string().trim().max(2000).optional().default(""),
  attivo: z.boolean().optional().default(true),
});

export type ProcessoAttivitaInput = z.infer<typeof processoAttivitaInputSchema>;

export const processoInputSchema = z.object({
  codice: z.string().trim().min(1, "Codice obbligatorio.").max(64),
  nome: z.string().trim().min(1, "Nome obbligatorio.").max(200),
  descrizione: z.string().trim().max(2000).optional().default(""),
  note: z.string().trim().max(2000).optional().default(""),
  attivo: z.boolean().optional().default(true),
});

export type ProcessoInput = z.infer<typeof processoInputSchema>;

export const processoPassoInputSchema = z.object({
  attivitaId: z.string().uuid("Attività non valida."),
  obbligatorio: z.boolean().optional().default(true),
  note: z.string().trim().max(1000).optional().default(""),
});

export const processoComposizioneSchema = z.object({
  passi: z.array(processoPassoInputSchema).max(500),
});

export type ProcessoComposizioneInput = z.infer<
  typeof processoComposizioneSchema
>;

export function labelDocumentoStato(stato: ProcessoDocumentoStato): string {
  switch (stato) {
    case "bozza":
      return "Bozza";
    case "approvato":
      return "Approvato";
    case "chiuso":
      return "Chiuso";
    default:
      return stato;
  }
}
