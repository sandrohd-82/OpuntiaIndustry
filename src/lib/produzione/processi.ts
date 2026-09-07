import { z } from "zod";

export const PROCESSO_DOCUMENTO_STATI = [
  "bozza",
  "approvato",
  "chiuso",
] as const;

export type ProcessoDocumentoStato = (typeof PROCESSO_DOCUMENTO_STATI)[number];

const optionalUuid = z
  .union([z.string().uuid(), z.literal(""), z.null(), z.undefined()])
  .transform((v) => (typeof v === "string" && v.length > 0 ? v : null));

export type ProcessoAttivita = {
  id: string;
  codice: string;
  nome: string;
  descrizione: string;
  attivo: boolean;
  note: string;
  areaId: string | null;
  postoId: string | null;
  areaNome: string;
  postoNome: string;
  createdAt: string;
};

export type Processo = {
  id: string;
  codice: string;
  nome: string;
  descrizione: string;
  attivo: boolean;
  note: string;
  areaId: string | null;
  areaNome: string;
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
  attivitaAreaId: string | null;
  attivitaPostoId: string | null;
  attivitaAreaNome: string;
  attivitaPostoNome: string;
};

export const processoAttivitaInputSchema = z
  .object({
    codice: z.string().trim().min(1, "Codice obbligatorio.").max(64),
    nome: z.string().trim().min(1, "Nome obbligatorio.").max(200),
    descrizione: z.string().trim().max(2000).optional().default(""),
    note: z.string().trim().max(2000).optional().default(""),
    attivo: z.boolean().optional().default(true),
    areaId: optionalUuid,
    postoId: optionalUuid,
  })
  .superRefine((data, ctx) => {
    if (data.postoId && !data.areaId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "La postazione richiede un'area.",
        path: ["areaId"],
      });
    }
  });

export type ProcessoAttivitaInput = z.infer<typeof processoAttivitaInputSchema>;

export const processoInputSchema = z.object({
  codice: z.string().trim().min(1, "Codice obbligatorio.").max(64),
  nome: z.string().trim().min(1, "Nome obbligatorio.").max(200),
  descrizione: z.string().trim().max(2000).optional().default(""),
  note: z.string().trim().max(2000).optional().default(""),
  attivo: z.boolean().optional().default(true),
  areaId: optionalUuid,
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

export function labelLuogoAttivita(a: {
  areaNome?: string;
  postoNome?: string;
}): string {
  const area = (a.areaNome ?? "").trim();
  const posto = (a.postoNome ?? "").trim();
  if (area && posto) return `${area} · ${posto}`;
  if (area) return area;
  return "Non legata ad area";
}

export function attivitaCompatibileConArea(
  attivitaAreaId: string | null | undefined,
  processoAreaId: string | null | undefined
): boolean {
  if (!processoAreaId) return true;
  if (!attivitaAreaId) return true;
  return attivitaAreaId === processoAreaId;
}
