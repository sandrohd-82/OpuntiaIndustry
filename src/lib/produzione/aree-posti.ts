import { z } from "zod";

export const DOCUMENTO_STATI = ["bozza", "approvato", "chiuso"] as const;
export type DocumentoStato = (typeof DOCUMENTO_STATI)[number];

export const BILANCIO_ESITI = ["incompleto", "ok", "squilibrio"] as const;
export type BilancioEsito = (typeof BILANCIO_ESITI)[number];

export const BILANCIO_TOLLERANZA_KG = 0.01;

export type ProduzionePostoLavoro = {
  id: string;
  areaId: string;
  codice: string;
  nome: string;
  descrizione: string;
  attivo: boolean;
  sortOrder: number;
  note: string;
  hasCamera: boolean;
  cameraIp: string | null;
  cameraRtspPath: string;
};

export type ProduzioneArea = {
  id: string;
  codice: string;
  nome: string;
  descrizione: string;
  richiedeBilancioMassa: boolean;
  attivo: boolean;
  sortOrder: number;
  versione: number;
  documentoStato: DocumentoStato;
  note: string;
  mostraInMenu: boolean;
  hasCamera: boolean;
  cameraIp: string | null;
  cameraRtspPath: string;
  posti: ProduzionePostoLavoro[];
};

export type FoglioConteggio = {
  id: string;
  foglioId: string;
  areaId: string;
  kgVersati: number;
  kgEssiccatori: number;
  kgNonConformi: number;
  esitoBilancio: BilancioEsito;
  deltaKg: number;
  noteNc: string;
  esitoNc: string;
  approvedAt: string | null;
  approvedBy: string | null;
};

export const postoLavoroInputSchema = z.object({
  areaId: z.string().uuid(),
  codice: z
    .string()
    .trim()
    .min(1, "Codice obbligatorio")
    .max(40)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/i, "Usa lettere, numeri e trattini"),
  nome: z.string().trim().min(1, "Nome obbligatorio").max(120),
  descrizione: z.string().trim().max(500).optional().default(""),
  attivo: z.boolean().optional().default(true),
  sortOrder: z.number().int().optional(),
  note: z.string().trim().max(2000).optional().default(""),
});

export type PostoLavoroInput = z.infer<typeof postoLavoroInputSchema>;

export const foglioConteggioInputSchema = z.object({
  foglioId: z.string().uuid(),
  areaId: z.string().uuid(),
  kgVersati: z.number().min(0, "Quantità versata non valida"),
  kgEssiccatori: z.number().min(0, "Quantità essiccatori non valida"),
  kgNonConformi: z.number().min(0, "Quantità non conforme non valida"),
  noteNc: z.string().trim().max(2000).optional().default(""),
  esitoNc: z.string().trim().max(500).optional().default(""),
});

export type FoglioConteggioInput = z.infer<typeof foglioConteggioInputSchema>;

export function calcolaBilancioMassa(input: {
  kgVersati: number;
  kgEssiccatori: number;
  kgNonConformi: number;
}): { esito: BilancioEsito; deltaKg: number } {
  const atteso = input.kgEssiccatori + input.kgNonConformi;
  const delta = Math.round((input.kgVersati - atteso) * 1000) / 1000;
  if (input.kgVersati <= 0 && atteso <= 0) {
    return { esito: "incompleto", deltaKg: 0 };
  }
  if (Math.abs(delta) <= BILANCIO_TOLLERANZA_KG) {
    return { esito: "ok", deltaKg: 0 };
  }
  return { esito: "squilibrio", deltaKg: delta };
}

export function slugPosto(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}
