import { z } from "zod";
import { ACTION_ESSICCATORE_IDS } from "@/lib/action/essiccatori";
import {
  TEMP_BRUCIATORE_MAX_C,
  TEMP_BRUCIATORE_MIN_C,
} from "@/lib/action/azioni-immediate";

export const DOCUMENTO_STATI_CATALOGO = [
  "bozza",
  "approvato",
  "chiuso",
] as const;
export type DocumentoStatoCatalogo = (typeof DOCUMENTO_STATI_CATALOGO)[number];

export const PROGRAMMATA_STATI = [
  "programmata",
  "in_corso",
  "eseguita",
  "annullata",
  "errore",
] as const;
export type ProgrammataStato = (typeof PROGRAMMATA_STATI)[number];

export const PROGRAMMATA_STATO_LABEL: Record<ProgrammataStato, string> = {
  programmata: "Programmata",
  in_corso: "In corso",
  eseguita: "Eseguita",
  annullata: "Annullata",
  errore: "Errore",
};

export type AzioneRegistrata = {
  id: string;
  essiccatoreId: string;
  azioneKey: "avvio";
  nome: string;
  descrizione: string;
  tempBruciatoreC: number;
  percVentilazione: number;
  durataMinuti: number | null;
  versione: number;
  documentoStato: DocumentoStatoCatalogo;
  createdAt: string;
};

export type AzioneProgrammata = {
  id: string;
  essiccatoreId: string;
  registrataId: string;
  registrataNome: string;
  eseguiAt: string;
  stato: ProgrammataStato;
  azioneEsecuzioneId: string | null;
  versione: number;
  documentoStato: DocumentoStatoCatalogo;
  note: string;
  createdAt: string;
};

export type ProcessoPasso = {
  id: string;
  registrataId: string;
  registrataNome: string;
  sortOrder: number;
};

export type ProcessoAzione = {
  id: string;
  essiccatoreId: string;
  nome: string;
  descrizione: string;
  versione: number;
  documentoStato: DocumentoStatoCatalogo;
  passi: ProcessoPasso[];
  createdAt: string;
};

export const DURATA_UNITA = ["minuti", "ore"] as const;
export type DurataUnita = (typeof DURATA_UNITA)[number];

export const DURATA_MINUTI_MAX = 60 * 24 * 30;

export function durataToMinuti(valore: number, unita: DurataUnita): number {
  const n = Math.floor(valore);
  return unita === "ore" ? n * 60 : n;
}

export function formatDurataMinuti(minuti: number | null | undefined): string {
  if (minuti == null || minuti < 1) return "Infinito";
  if (minuti % 60 === 0) {
    const h = minuti / 60;
    return h === 1 ? "1 ora" : `${h} ore`;
  }
  return minuti === 1 ? "1 minuto" : `${minuti} min`;
}

export const registrataInputSchema = z.object({
  essiccatoreId: z.enum(ACTION_ESSICCATORE_IDS),
  nome: z.string().trim().min(2).max(120),
  descrizione: z.string().trim().max(2000).optional().default(""),
  tempBruciatoreC: z
    .number()
    .int()
    .min(TEMP_BRUCIATORE_MIN_C)
    .max(TEMP_BRUCIATORE_MAX_C),
  percVentilazione: z.number().int().min(0).max(100),
  durataMinuti: z
    .number()
    .int()
    .min(1)
    .max(DURATA_MINUTI_MAX)
    .nullable(),
});

export const programmataInputSchema = z.object({
  essiccatoreId: z.enum(ACTION_ESSICCATORE_IDS),
  registrataId: z.string().uuid(),
  eseguiAt: z.string().min(10),
  note: z.string().trim().max(400).optional().default(""),
});

export const processoInputSchema = z.object({
  essiccatoreId: z.enum(ACTION_ESSICCATORE_IDS),
  nome: z.string().trim().min(2).max(120),
  descrizione: z.string().trim().max(400).optional().default(""),
  registrataIds: z
    .array(z.string().uuid())
    .min(2, "Un processo è un insieme di almeno due azioni registrate."),
});

export function formatEseguiAt(iso: string): string {
  try {
    return new Date(iso).toLocaleString("it-IT");
  } catch {
    return iso;
  }
}
