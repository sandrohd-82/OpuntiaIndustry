import { z } from "zod";
import type { AttivitaScriptLink } from "@/lib/script/catalogo";

export const PROCESSO_DOCUMENTO_STATI = [
  "bozza",
  "approvato",
  "chiuso",
] as const;

export type ProcessoDocumentoStato = (typeof PROCESSO_DOCUMENTO_STATI)[number];

const optionalUuid = z
  .union([z.string().uuid(), z.literal(""), z.null(), z.undefined()])
  .transform((v) => (typeof v === "string" && v.length > 0 ? v : null));

export const TEMPO_MEDIO_UNITA = ["sec", "min", "ore"] as const;

export type TempoMedioUnita = (typeof TEMPO_MEDIO_UNITA)[number];

export function parseTempoMedioUnita(
  value: string | null | undefined
): TempoMedioUnita {
  if (value === "min" || value === "ore") return value;
  return "sec";
}

export function labelTempoMedioUnita(unita: TempoMedioUnita): string {
  if (unita === "sec") return "Sec";
  if (unita === "min") return "Min";
  return "Ore";
}

export const TEMPO_OGNI_UNITA = ["pz", "kg", "g", "lt", "ml"] as const;

export type TempoOgniUnita = (typeof TEMPO_OGNI_UNITA)[number];

export function parseTempoOgniUnita(
  value: string | null | undefined
): TempoOgniUnita {
  if (
    value === "kg" ||
    value === "g" ||
    value === "lt" ||
    value === "ml"
  ) {
    return value;
  }
  return "pz";
}

export function labelTempoOgniUnita(unita: TempoOgniUnita): string {
  return unita;
}

export function formatTempoMedio(
  valore: number,
  unita: TempoMedioUnita,
  ogniValore = 1,
  ogniUnita: TempoOgniUnita = "pz"
): string {
  const tempo = `${Number.isFinite(valore) ? valore : 0} ${labelTempoMedioUnita(unita)}`;
  const ogni = Number.isFinite(ogniValore) && ogniValore > 0 ? ogniValore : 1;
  return `${tempo} · Ogni ${ogni} ${labelTempoOgniUnita(ogniUnita)}`;
}

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
  tempoMedioValore: number;
  tempoMedioUnita: TempoMedioUnita;
  tempoOgniValore: number;
  tempoOgniUnita: TempoOgniUnita;
  scripts: AttivitaScriptLink[];
  createdAt: string;
  deprecatoAt: string | null;
  deprecatoBy: string | null;
  deprecatoNote: string;
  sostituitoDa: string | null;
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
  deprecatoAt: string | null;
  deprecatoBy: string | null;
  deprecatoNote: string;
  sostituitoDa: string | null;
  sostituitoDaCodice: string;
  sostituitoDaNome: string;
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
  tempoMedioValore: number;
  tempoMedioUnita: TempoMedioUnita;
  tempoOgniValore: number;
  tempoOgniUnita: TempoOgniUnita;
  scripts: AttivitaScriptLink[];
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
    tempoMedioValore: z.coerce.number().int().min(0).max(999999).default(0),
    tempoMedioUnita: z.enum(TEMPO_MEDIO_UNITA).default("sec"),
    tempoOgniValore: z.coerce.number().int().min(1).max(999999).default(1),
    tempoOgniUnita: z.enum(TEMPO_OGNI_UNITA).default("pz"),
    scriptIds: z.array(z.string().uuid()).optional().default([]),
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

export const deprecaProcessoSchema = z.object({
  note: z.string().trim().max(2000).optional().default(""),
  sostituitoDa: optionalUuid,
});

export type DeprecaProcessoInput = z.infer<typeof deprecaProcessoSchema>;

export const deprecaProcessoAttivitaSchema = z.object({
  note: z.string().trim().max(2000).optional().default(""),
  sostituitoDa: optionalUuid,
});

export type DeprecaProcessoAttivitaInput = z.infer<
  typeof deprecaProcessoAttivitaSchema
>;

export function isProcessoInElenco(p: {
  deprecatoAt?: string | null;
}): boolean {
  return !p.deprecatoAt;
}

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
