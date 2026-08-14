import { z } from "zod";
import type { AttivitaRow } from "@/types/database";

/** Prefisso fisso targa attività. */
export const CODICE_ATTIVITA_PREFIX = "At";

/** Es. At-TRi/DRa , At-Prep/Imb */
export const CODICE_ATTIVITA_RE = /^At[A-Za-z0-9\-_\/]+$/;

/** Ore standard/giorno per calcolo A1 (ciclo a durata fissa). */
export const ORE_GIORNO_STANDARD_CICLO = 8;

/** Simbolo quantità variabile (senza numero). */
export const QUANTITA_VARIABILE_SIMBOLO = "⌀";

const BODY_RE = /[^A-Za-z0-9\-_\/]/g;

export type AttivitaModalitaTempo = "throughput" | "durata_fissa";
export type AttivitaQuantitaModo =
  | "fissa"
  | "range"
  | "variabile"
  | "nessuna";

export type Attivita = {
  id: string;
  codice: string;
  titolo: string;
  spiegazione: string;
  modalitaTempo: AttivitaModalitaTempo;
  kgPerOra: number;
  oreGiorno: number;
  oreCiclo: number | null;
  quantitaModo: AttivitaQuantitaModo | null;
  quantitaValore: number | null;
  quantitaDa: number | null;
  quantitaA: number | null;
  quantitaUnita: string;
  /** @deprecated UI rimossa; resta false in DB fino a nuova logica. */
  incastrabileDuranteLavorazione: boolean;
  documentoStato: "bozza" | "approvato" | "chiuso";
  versione: number;
  createdAt: string;
};

/** Attività collegata a un prodotto (con flag calendario). */
export type AttivitaLinked = Attivita & {
  obbligatoria: boolean;
  sortOrder: number;
};

/** Prodotto Agrinsicilia collegato a un’attività. */
export type ProdottoLinkedAdAttivita = {
  prodottoId: string;
  codice: string;
  nome: string;
  isBio: boolean;
  obbligatoria: boolean;
};

export type AttivitaProdottoLinkInput = {
  prodottoId: string;
  obbligatoria: boolean;
};

export type AttivitaInput = {
  codice: string;
  titolo: string;
  spiegazione?: string;
  modalitaTempo?: AttivitaModalitaTempo;
  kgPerOra?: number;
  oreGiorno?: number;
  oreCiclo?: number | null;
  quantitaModo?: AttivitaQuantitaModo | null;
  quantitaValore?: number | null;
  quantitaDa?: number | null;
  quantitaA?: number | null;
  quantitaUnita?: string;
  documentoStato?: "bozza" | "approvato" | "chiuso";
  /** Collegamenti prodotti Agrinsicilia (salvati dopo create/update). */
  prodottiLinks?: AttivitaProdottoLinkInput[];
};

/** Draft modificabile in fase ordine/calendario. */
export type AttivitaOrdineDraft = {
  attivitaId: string;
  codice: string;
  titolo: string;
  spiegazione: string;
  modalitaTempo: AttivitaModalitaTempo;
  kgPerOra: number;
  oreGiorno: number;
  oreCiclo: number | null;
  quantitaModo: AttivitaQuantitaModo | null;
  quantitaValore: number | null;
  quantitaDa: number | null;
  quantitaA: number | null;
  quantitaUnita: string;
  /** Se valorizzato, sovrascrive il calcolo automatico. */
  giorniOverride: number | null;
  enabled: boolean;
};

export const attivitaInputSchema = z
  .object({
    codice: z.string().trim().min(2).max(64),
    titolo: z.string().trim().min(1).max(200),
    spiegazione: z.string().max(4000).optional().default(""),
    modalitaTempo: z
      .enum(["throughput", "durata_fissa"])
      .optional()
      .default("throughput"),
    kgPerOra: z.number().positive().max(1_000_000).optional(),
    oreGiorno: z.number().positive().max(24).optional(),
    oreCiclo: z.number().positive().max(10_000).nullable().optional(),
    quantitaModo: z
      .enum(["fissa", "range", "variabile", "nessuna"])
      .nullable()
      .optional(),
    quantitaValore: z.number().positive().max(1_000_000).nullable().optional(),
    quantitaDa: z.number().positive().max(1_000_000).nullable().optional(),
    quantitaA: z.number().positive().max(1_000_000).nullable().optional(),
    quantitaUnita: z.string().trim().max(32).optional().default("kg"),
    documentoStato: z
      .enum(["bozza", "approvato", "chiuso"])
      .optional()
      .default("approvato"),
  })
  .superRefine((val, ctx) => {
    if (val.modalitaTempo === "durata_fissa") {
      if (val.oreCiclo == null || !(val.oreCiclo > 0)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Indica le ore del ciclo a durata fissa.",
          path: ["oreCiclo"],
        });
      }
      const modo = val.quantitaModo;
      if (!modo) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Scegli il tipo di quantità del ciclo.",
          path: ["quantitaModo"],
        });
      } else if (modo === "fissa") {
        if (val.quantitaValore == null || !(val.quantitaValore > 0)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Indica la quantità fissa del ciclo.",
            path: ["quantitaValore"],
          });
        }
      } else if (modo === "range") {
        if (val.quantitaDa == null || !(val.quantitaDa > 0)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Indica la quantità minima (da).",
            path: ["quantitaDa"],
          });
        }
        if (val.quantitaA == null || !(val.quantitaA > 0)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Indica la quantità massima (a).",
            path: ["quantitaA"],
          });
        }
        if (
          val.quantitaDa != null &&
          val.quantitaA != null &&
          val.quantitaA < val.quantitaDa
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "La quantità «a» deve essere ≥ «da».",
            path: ["quantitaA"],
          });
        }
      }
    } else {
      if (val.kgPerOra == null || !(val.kgPerOra > 0)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Indica i kg medi per ora (> 0).",
          path: ["kgPerOra"],
        });
      }
      if (val.oreGiorno == null || !(val.oreGiorno > 0)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Indica le ore/giorno (> 0).",
          path: ["oreGiorno"],
        });
      }
    }
  });

export function sanitizeCodiceAttivitaBody(value: string): string {
  let body = value.replace(BODY_RE, "");
  while (body.startsWith(CODICE_ATTIVITA_PREFIX)) {
    body = body.slice(CODICE_ATTIVITA_PREFIX.length);
  }
  if (body.length >= 2 && body.slice(0, 2).toLowerCase() === "at") {
    body = body.slice(2);
  }
  return body;
}

export function composeCodiceAttivita(body: string): string {
  const sanitized = sanitizeCodiceAttivitaBody(body);
  if (!sanitized) return "";
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
  const modalitaTempo: AttivitaModalitaTempo =
    input.modalitaTempo === "durata_fissa" ? "durata_fissa" : "throughput";

  if (modalitaTempo === "durata_fissa") {
    const modo = input.quantitaModo ?? "nessuna";
    return {
      codice: sanitizeCodiceAttivita(input.codice),
      titolo: input.titolo.trim(),
      spiegazione: input.spiegazione?.trim() ?? "",
      modalitaTempo,
      // Placeholder DB (check > 0): non usati in calcolo A1
      kgPerOra: 1,
      oreGiorno: ORE_GIORNO_STANDARD_CICLO,
      oreCiclo: Number(input.oreCiclo),
      quantitaModo: modo,
      quantitaValore: modo === "fissa" ? Number(input.quantitaValore) : null,
      quantitaDa: modo === "range" ? Number(input.quantitaDa) : null,
      quantitaA: modo === "range" ? Number(input.quantitaA) : null,
      quantitaUnita: (input.quantitaUnita ?? "kg").trim() || "kg",
      documentoStato: input.documentoStato ?? "approvato",
    };
  }

  return {
    codice: sanitizeCodiceAttivita(input.codice),
    titolo: input.titolo.trim(),
    spiegazione: input.spiegazione?.trim() ?? "",
    modalitaTempo: "throughput",
    kgPerOra: Number(input.kgPerOra),
    oreGiorno: Number(input.oreGiorno ?? 8),
    oreCiclo: null,
    quantitaModo: null,
    quantitaValore: null,
    quantitaDa: null,
    quantitaA: null,
    quantitaUnita: (input.quantitaUnita ?? "kg").trim() || "kg",
    documentoStato: input.documentoStato ?? "approvato",
  };
}

export function mapAttivitaRow(row: AttivitaRow): Attivita {
  const modalita =
    row.modalita_tempo === "durata_fissa" ? "durata_fissa" : "throughput";
  return {
    id: row.id,
    codice: row.codice,
    titolo: row.titolo,
    spiegazione: row.spiegazione ?? "",
    modalitaTempo: modalita,
    kgPerOra: Number(row.kg_per_ora),
    oreGiorno: Number(row.ore_giorno),
    oreCiclo:
      row.ore_ciclo == null ? null : Number(row.ore_ciclo),
    quantitaModo: (row.quantita_modo as AttivitaQuantitaModo | null) ?? null,
    quantitaValore:
      row.quantita_valore == null ? null : Number(row.quantita_valore),
    quantitaDa: row.quantita_da == null ? null : Number(row.quantita_da),
    quantitaA: row.quantita_a == null ? null : Number(row.quantita_a),
    quantitaUnita: row.quantita_unita?.trim() || "kg",
    incastrabileDuranteLavorazione: false,
    documentoStato: row.documento_stato,
    versione: row.versione,
    createdAt: row.created_at,
  };
}

export function formatQuantitaAttivita(
  a: Pick<
    Attivita,
    | "modalitaTempo"
    | "quantitaModo"
    | "quantitaValore"
    | "quantitaDa"
    | "quantitaA"
    | "quantitaUnita"
  >
): string {
  if (a.modalitaTempo !== "durata_fissa") return "";
  const u = a.quantitaUnita || "kg";
  switch (a.quantitaModo) {
    case "fissa":
      return a.quantitaValore != null ? `${a.quantitaValore} ${u}` : "—";
    case "range":
      return a.quantitaDa != null && a.quantitaA != null
        ? `${a.quantitaDa}–${a.quantitaA} ${u}`
        : "—";
    case "variabile":
      return `${QUANTITA_VARIABILE_SIMBOLO} ${u}`;
    case "nessuna":
      return "senza quantità";
    default:
      return "—";
  }
}

export function formatTempoAttivita(a: Attivita): string {
  if (a.modalitaTempo === "durata_fissa") {
    const ore = a.oreCiclo != null ? `${a.oreCiclo} h ciclo` : "durata fissa";
    const q = formatQuantitaAttivita(a);
    return q ? `${ore} · ${q}` : ore;
  }
  return `${a.kgPerOra} kg/h (${a.oreGiorno} h/g)`;
}

export function attivitaToOrdineDraft(
  a: Attivita & { obbligatoria?: boolean }
): AttivitaOrdineDraft {
  return {
    attivitaId: a.id,
    codice: a.codice,
    titolo: a.titolo,
    spiegazione: a.spiegazione,
    modalitaTempo: a.modalitaTempo,
    kgPerOra: a.kgPerOra,
    oreGiorno: a.oreGiorno,
    oreCiclo: a.oreCiclo,
    quantitaModo: a.quantitaModo,
    quantitaValore: a.quantitaValore,
    quantitaDa: a.quantitaDa,
    quantitaA: a.quantitaA,
    quantitaUnita: a.quantitaUnita,
    giorniOverride: null,
    /** Facoltative: off di default nel calendario ordine. */
    enabled: a.obbligatoria !== false,
  };
}

/**
 * Giorni lavorativi richiesti per un'attività.
 * - throughput: ceil(kg / (kgOra × oreGiorno))
 * - durata_fissa (A1): ceil(oreCiclo / 8) — indipendente dai kg ordine
 */
export function calcGiorniAttivita(input: {
  kgOrdine: number;
  giorniProduzione: number;
  modalitaTempo?: AttivitaModalitaTempo;
  kgPerOra: number;
  oreGiorno: number;
  oreCiclo?: number | null;
  giorniOverride?: number | null;
}): number {
  if (
    input.giorniOverride != null &&
    Number.isFinite(input.giorniOverride) &&
    input.giorniOverride >= 0
  ) {
    return Math.floor(input.giorniOverride);
  }

  if (input.modalitaTempo === "durata_fissa") {
    const ore = Math.max(0, Number(input.oreCiclo ?? 0));
    if (ore <= 0) return 0;
    return Math.max(1, Math.ceil(ore / ORE_GIORNO_STANDARD_CICLO));
  }

  const kg = Math.max(0, input.kgOrdine);
  if (kg <= 0) return 0;
  const throughput = Math.max(0, input.kgPerOra) * Math.max(0, input.oreGiorno);
  if (throughput <= 0) return 1;
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
          modalitaTempo: d.modalitaTempo,
          kgPerOra: d.kgPerOra,
          oreGiorno: d.oreGiorno,
          oreCiclo: d.oreCiclo,
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
