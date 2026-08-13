import { z } from "zod";
import type { AttivitaRow } from "@/types/database";

/** Prefisso fisso targa attività. */
export const CODICE_ATTIVITA_PREFIX = "At";

/** Es. At-TRi/DRa , At-Prep/Imb */
export const CODICE_ATTIVITA_RE = /^At[A-Za-z0-9\-_\/]+$/;

const BODY_RE = /[^A-Za-z0-9\-_\/]/g;

export type Attivita = {
  id: string;
  codice: string;
  titolo: string;
  spiegazione: string;
  kgPerOra: number;
  oreGiorno: number;
  incastrabileDuranteLavorazione: boolean;
  documentoStato: "bozza" | "approvato" | "chiuso";
  versione: number;
  createdAt: string;
};

export type AttivitaInput = {
  codice: string;
  titolo: string;
  spiegazione?: string;
  kgPerOra: number;
  oreGiorno?: number;
  incastrabileDuranteLavorazione?: boolean;
  documentoStato?: "bozza" | "approvato" | "chiuso";
};

/** Draft modificabile in fase ordine/calendario. */
export type AttivitaOrdineDraft = {
  attivitaId: string;
  codice: string;
  titolo: string;
  spiegazione: string;
  kgPerOra: number;
  oreGiorno: number;
  incastrabileDuranteLavorazione: boolean;
  /** Se valorizzato, sovrascrive il calcolo automatico. */
  giorniOverride: number | null;
  enabled: boolean;
};

export const attivitaInputSchema = z.object({
  codice: z.string().trim().min(2).max(64),
  titolo: z.string().trim().min(1).max(200),
  spiegazione: z.string().max(4000).optional().default(""),
  kgPerOra: z.number().positive().max(1_000_000),
  oreGiorno: z.number().positive().max(24).optional().default(8),
  incastrabileDuranteLavorazione: z.boolean().optional().default(false),
  documentoStato: z
    .enum(["bozza", "approvato", "chiuso"])
    .optional()
    .default("approvato"),
});

export function sanitizeCodiceAttivitaBody(value: string): string {
  let body = value.replace(BODY_RE, "");
  while (body.startsWith(CODICE_ATTIVITA_PREFIX)) {
    body = body.slice(CODICE_ATTIVITA_PREFIX.length);
  }
  if (body.length >= 2 && body.slice(0, 2).toLowerCase() === "at") {
    body = body.slice(2);
  }
  // Consenti corpo che inizia con - (es. -TRi/DRa → At-TRi/DRa)
  return body;
}

export function composeCodiceAttivita(body: string): string {
  const sanitized = sanitizeCodiceAttivitaBody(body);
  if (!sanitized) return "";
  // Se l'utente non ha messo il separatore, non forziamo "-";
  // ma esempi tipici usano At-…
  return CODICE_ATTIVITA_PREFIX + sanitized;
}

export function stripCodiceAttivitaPrefix(codice: string): string {
  if (codice.startsWith(CODICE_ATTIVITA_PREFIX)) {
    return codice.slice(CODICE_ATTIVITA_PREFIX.length);
  }
  if (codice.length >= 2 && codice.slice(0, 2).toLowerCase() === "at") {
    return codice.slice(2);
  }
  return codice;
}

export function sanitizeCodiceAttivita(value: string): string {
  return composeCodiceAttivita(stripCodiceAttivitaPrefix(value.trim()));
}

export function isValidCodiceAttivita(codice: string): boolean {
  return CODICE_ATTIVITA_RE.test(codice);
}

export function normalizeAttivitaInput(input: AttivitaInput): AttivitaInput {
  return {
    codice: sanitizeCodiceAttivita(input.codice),
    titolo: input.titolo.trim(),
    spiegazione: input.spiegazione?.trim() ?? "",
    kgPerOra: Number(input.kgPerOra),
    oreGiorno: Number(input.oreGiorno ?? 8),
    incastrabileDuranteLavorazione: Boolean(
      input.incastrabileDuranteLavorazione
    ),
    documentoStato: input.documentoStato ?? "approvato",
  };
}

export function mapAttivitaRow(row: AttivitaRow): Attivita {
  return {
    id: row.id,
    codice: row.codice,
    titolo: row.titolo,
    spiegazione: row.spiegazione ?? "",
    kgPerOra: Number(row.kg_per_ora),
    oreGiorno: Number(row.ore_giorno),
    incastrabileDuranteLavorazione: Boolean(
      row.incastrabile_durante_lavorazione
    ),
    documentoStato: row.documento_stato,
    versione: row.versione,
    createdAt: row.created_at,
  };
}

export function attivitaToOrdineDraft(a: Attivita): AttivitaOrdineDraft {
  return {
    attivitaId: a.id,
    codice: a.codice,
    titolo: a.titolo,
    spiegazione: a.spiegazione,
    kgPerOra: a.kgPerOra,
    oreGiorno: a.oreGiorno,
    incastrabileDuranteLavorazione: a.incastrabileDuranteLavorazione,
    giorniOverride: null,
    enabled: true,
  };
}

/**
 * Giorni lavorativi richiesti per un'attività (opzione A).
 * - Non incastrabile: ceil(kg / (kgOra × oreGiorno))
 * - Incastrabile: solo l'ultimo quantitativo giornaliero dopo la lavorazione
 */
export function calcGiorniAttivita(input: {
  kgOrdine: number;
  giorniProduzione: number;
  kgPerOra: number;
  oreGiorno: number;
  incastrabileDuranteLavorazione: boolean;
  giorniOverride?: number | null;
}): number {
  if (
    input.giorniOverride != null &&
    Number.isFinite(input.giorniOverride) &&
    input.giorniOverride >= 0
  ) {
    return Math.floor(input.giorniOverride);
  }
  const kg = Math.max(0, input.kgOrdine);
  if (kg <= 0) return 0;
  const throughput = Math.max(0, input.kgPerOra) * Math.max(0, input.oreGiorno);
  if (throughput <= 0) return 1;

  if (input.incastrabileDuranteLavorazione) {
    const giorniProd = Math.max(1, Math.floor(input.giorniProduzione));
    const kgUltimoGiorno = kg / giorniProd;
    return Math.max(1, Math.ceil(kgUltimoGiorno / throughput));
  }
  return Math.max(1, Math.ceil(kg / throughput));
}

export function totalGiorniAttivitaOltreLavorazione(
  drafts: AttivitaOrdineDraft[],
  kgOrdine: number,
  giorniProduzione: number
): number {
  return drafts
    .filter((d) => d.enabled)
    .reduce(
      (sum, d) =>
        sum +
        calcGiorniAttivita({
          kgOrdine,
          giorniProduzione,
          kgPerOra: d.kgPerOra,
          oreGiorno: d.oreGiorno,
          incastrabileDuranteLavorazione: d.incastrabileDuranteLavorazione,
          giorniOverride: d.giorniOverride,
        }),
      0
    );
}

export type SegmentoCalendarioAttivita = {
  attivitaId: string;
  codice: string;
  titolo: string;
  giorni: number;
  dates: string[];
};
