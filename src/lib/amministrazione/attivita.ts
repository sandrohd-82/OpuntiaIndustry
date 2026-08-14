import { z } from "zod";
import type {
  AttivitaRow,
  AttivitaTempoOpzioneRow,
} from "@/types/database";

/** Prefisso fisso targa attività. */
export const CODICE_ATTIVITA_PREFIX = "At";

/** Prefisso targa formazione necessaria. */
export const CODICE_FORMAZIONE_PREFIX = "Fo";

/** Es. At-TRi/DRa , At-Prep/Imb */
export const CODICE_ATTIVITA_RE = /^At[A-Za-z0-9\-_\/]+$/;
export const CODICE_FORMAZIONE_RE = /^Fo[A-Za-z0-9\-_\/]+$/;

/** Ore standard/giorno per calcolo A1 (ciclo a durata fissa / opzioni). */
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

export type AttivitaTempoOpzione = {
  id?: string;
  nome: string;
  quantitaValore: number;
  quantitaUnita: string;
  ore: number;
  minuti: number;
  sortOrder: number;
};

export type AttivitaTempoOpzioneInput = {
  id?: string;
  nome: string;
  quantitaValore: number;
  quantitaUnita?: string;
  ore: number;
  minuti: number;
};

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
  tempoMultiplo: boolean;
  tempoOpzioni: AttivitaTempoOpzione[];
  operatoriNecessari: number;
  formazioneCodice: string;
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
  tempoMultiplo?: boolean;
  tempoOpzioni?: AttivitaTempoOpzioneInput[];
  operatoriNecessari?: number;
  formazioneCodice?: string;
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
  tempoMultiplo: boolean;
  tempoOpzioni: AttivitaTempoOpzione[];
  selectedOpzioneId: string | null;
  operatoriNecessari: number;
  formazioneCodice: string;
  /** Se valorizzato, sovrascrive il calcolo automatico. */
  giorniOverride: number | null;
  enabled: boolean;
};

const tempoOpzioneSchema = z.object({
  id: z.string().uuid().optional(),
  nome: z.string().trim().min(1).max(200),
  quantitaValore: z.number().positive().max(1_000_000),
  quantitaUnita: z.string().trim().max(32).optional().default("kg"),
  ore: z.number().int().min(0).max(10_000),
  minuti: z.number().int().min(0).max(59),
});

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
    tempoMultiplo: z.boolean().optional().default(false),
    tempoOpzioni: z.array(tempoOpzioneSchema).optional().default([]),
    operatoriNecessari: z.number().int().min(0).max(999).optional().default(1),
    formazioneCodice: z.string().trim().max(64).optional().default(""),
    documentoStato: z
      .enum(["bozza", "approvato", "chiuso"])
      .optional()
      .default("approvato"),
  })
  .superRefine((val, ctx) => {
    if (val.tempoMultiplo) {
      if (!val.tempoOpzioni?.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Aggiungi almeno un’opzione di tempo/quantità.",
          path: ["tempoOpzioni"],
        });
      }
      val.tempoOpzioni?.forEach((op, i) => {
        if (op.ore <= 0 && op.minuti <= 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Indica ore e/o minuti (> 0).",
            path: ["tempoOpzioni", i, "ore"],
          });
        }
      });
    } else if (val.modalitaTempo === "durata_fissa") {
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

    const fo = (val.formazioneCodice ?? "").trim();
    if (fo && !isValidCodiceFormazione(sanitizeCodiceFormazione(fo))) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Formazione: targa non valida (prefisso Fo).",
        path: ["formazioneCodice"],
      });
    }
    if (isFormazioneObbligatoria() && !fo) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "La formazione necessaria è obbligatoria.",
        path: ["formazioneCodice"],
      });
    }
  });

/** In develop resta false; in prod impostare ATTIVITA_FORMAZIONE_OBBLIGATORIA=true */
export function isFormazioneObbligatoria(): boolean {
  return (
    process.env.ATTIVITA_FORMAZIONE_OBBLIGATORIA === "true" ||
    process.env.NEXT_PUBLIC_ATTIVITA_FORMAZIONE_OBBLIGATORIA === "true"
  );
}

function sanitizePrefixedBody(value: string, prefix: string): string {
  let body = value.replace(BODY_RE, "");
  while (body.startsWith(prefix)) {
    body = body.slice(prefix.length);
  }
  const pLow = prefix.toLowerCase();
  if (body.length >= pLow.length && body.slice(0, pLow.length).toLowerCase() === pLow) {
    body = body.slice(pLow.length);
  }
  return body;
}

export function sanitizeCodiceAttivitaBody(value: string): string {
  return sanitizePrefixedBody(value, CODICE_ATTIVITA_PREFIX);
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

export function sanitizeCodiceFormazioneBody(value: string): string {
  return sanitizePrefixedBody(value, CODICE_FORMAZIONE_PREFIX);
}

export function composeCodiceFormazione(body: string): string {
  const sanitized = sanitizeCodiceFormazioneBody(body);
  if (!sanitized) return "";
  return CODICE_FORMAZIONE_PREFIX + sanitized;
}

export function stripCodiceFormazionePrefix(codice: string): string {
  if (codice.startsWith(CODICE_FORMAZIONE_PREFIX)) {
    return codice.slice(CODICE_FORMAZIONE_PREFIX.length);
  }
  if (codice.length >= 2 && codice.slice(0, 2).toLowerCase() === "fo") {
    return codice.slice(2);
  }
  return codice;
}

export function sanitizeCodiceFormazione(value: string): string {
  const t = value.trim();
  if (!t) return "";
  return composeCodiceFormazione(stripCodiceFormazionePrefix(t));
}

export function isValidCodiceFormazione(codice: string): boolean {
  return CODICE_FORMAZIONE_RE.test(codice);
}

export function oreTotaliOpzione(op: Pick<AttivitaTempoOpzione, "ore" | "minuti">): number {
  return Math.max(0, Number(op.ore) || 0) + Math.max(0, Number(op.minuti) || 0) / 60;
}

export function formatDurataOpzione(
  op: Pick<AttivitaTempoOpzione, "ore" | "minuti">
): string {
  const parts: string[] = [];
  if (op.ore > 0) parts.push(`${op.ore} h`);
  if (op.minuti > 0) parts.push(`${op.minuti} min`);
  return parts.length ? parts.join(" ") : "—";
}

export function mapTempoOpzioneRow(
  row: AttivitaTempoOpzioneRow
): AttivitaTempoOpzione {
  return {
    id: row.id,
    nome: row.nome,
    quantitaValore: Number(row.quantita_valore),
    quantitaUnita: row.quantita_unita?.trim() || "kg",
    ore: Number(row.ore) || 0,
    minuti: Number(row.minuti) || 0,
    sortOrder: Number(row.sort_order) || 0,
  };
}

export function normalizeAttivitaInput(input: AttivitaInput): AttivitaInput {
  const tempoMultiplo = Boolean(input.tempoMultiplo);
  const formazioneCodice = sanitizeCodiceFormazione(
    input.formazioneCodice ?? ""
  );
  const operatoriNecessari = Math.max(
    0,
    Math.floor(Number(input.operatoriNecessari ?? 1))
  );
  const tempoOpzioni = (input.tempoOpzioni ?? []).map((op, i) => ({
    id: op.id,
    nome: op.nome.trim(),
    quantitaValore: Number(op.quantitaValore),
    quantitaUnita: (op.quantitaUnita ?? "kg").trim() || "kg",
    ore: Math.max(0, Math.floor(Number(op.ore) || 0)),
    minuti: Math.min(59, Math.max(0, Math.floor(Number(op.minuti) || 0))),
    sortOrder: i,
  }));

  const base = {
    codice: sanitizeCodiceAttivita(input.codice),
    titolo: input.titolo.trim(),
    spiegazione: input.spiegazione?.trim() ?? "",
    tempoMultiplo,
    tempoOpzioni,
    operatoriNecessari,
    formazioneCodice,
    documentoStato: input.documentoStato ?? ("approvato" as const),
  };

  if (tempoMultiplo) {
    return {
      ...base,
      modalitaTempo: "durata_fissa",
      kgPerOra: 1,
      oreGiorno: ORE_GIORNO_STANDARD_CICLO,
      oreCiclo: null,
      quantitaModo: null,
      quantitaValore: null,
      quantitaDa: null,
      quantitaA: null,
      quantitaUnita: "kg",
    };
  }

  const modalitaTempo: AttivitaModalitaTempo =
    input.modalitaTempo === "durata_fissa" ? "durata_fissa" : "throughput";

  if (modalitaTempo === "durata_fissa") {
    const modo = input.quantitaModo ?? "nessuna";
    return {
      ...base,
      modalitaTempo,
      kgPerOra: 1,
      oreGiorno: ORE_GIORNO_STANDARD_CICLO,
      oreCiclo: Number(input.oreCiclo),
      quantitaModo: modo,
      quantitaValore: modo === "fissa" ? Number(input.quantitaValore) : null,
      quantitaDa: modo === "range" ? Number(input.quantitaDa) : null,
      quantitaA: modo === "range" ? Number(input.quantitaA) : null,
      quantitaUnita: (input.quantitaUnita ?? "kg").trim() || "kg",
    };
  }

  return {
    ...base,
    modalitaTempo: "throughput",
    kgPerOra: Number(input.kgPerOra),
    oreGiorno: Number(input.oreGiorno ?? 8),
    oreCiclo: null,
    quantitaModo: null,
    quantitaValore: null,
    quantitaDa: null,
    quantitaA: null,
    quantitaUnita: (input.quantitaUnita ?? "kg").trim() || "kg",
  };
}

export function mapAttivitaRow(
  row: AttivitaRow,
  opzioni: AttivitaTempoOpzione[] = []
): Attivita {
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
    oreCiclo: row.ore_ciclo == null ? null : Number(row.ore_ciclo),
    quantitaModo: (row.quantita_modo as AttivitaQuantitaModo | null) ?? null,
    quantitaValore:
      row.quantita_valore == null ? null : Number(row.quantita_valore),
    quantitaDa: row.quantita_da == null ? null : Number(row.quantita_da),
    quantitaA: row.quantita_a == null ? null : Number(row.quantita_a),
    quantitaUnita: row.quantita_unita?.trim() || "kg",
    tempoMultiplo: Boolean(row.tempo_multiplo),
    tempoOpzioni: opzioni,
    operatoriNecessari: Number(row.operatori_necessari ?? 1),
    formazioneCodice: row.formazione_codice?.trim() || "",
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
  if (a.tempoMultiplo) {
    const n = a.tempoOpzioni.length;
    return n === 0
      ? "multiplo (0 opzioni)"
      : `multiplo · ${n} opzion${n === 1 ? "e" : "i"}`;
  }
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
  const firstOp = a.tempoOpzioni[0] ?? null;
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
    tempoMultiplo: a.tempoMultiplo,
    tempoOpzioni: a.tempoOpzioni,
    selectedOpzioneId: firstOp?.id ?? null,
    operatoriNecessari: a.operatoriNecessari,
    formazioneCodice: a.formazioneCodice,
    giorniOverride: null,
    enabled: a.obbligatoria !== false,
  };
}

/**
 * Giorni lavorativi richiesti per un'attività.
 * - multiplo: A1 su ore+minuti dell’opzione selezionata
 * - durata_fissa: ceil(oreCiclo / 8)
 * - throughput: ceil(kg / (kgOra × oreGiorno))
 */
export function calcGiorniAttivita(input: {
  kgOrdine: number;
  giorniProduzione: number;
  modalitaTempo?: AttivitaModalitaTempo;
  kgPerOra: number;
  oreGiorno: number;
  oreCiclo?: number | null;
  tempoMultiplo?: boolean;
  tempoOpzioni?: AttivitaTempoOpzione[];
  selectedOpzioneId?: string | null;
  giorniOverride?: number | null;
}): number {
  if (
    input.giorniOverride != null &&
    Number.isFinite(input.giorniOverride) &&
    input.giorniOverride >= 0
  ) {
    return Math.floor(input.giorniOverride);
  }

  if (input.tempoMultiplo) {
    const ops = input.tempoOpzioni ?? [];
    const selected =
      ops.find((o) => o.id && o.id === input.selectedOpzioneId) ?? ops[0];
    if (!selected) return 0;
    const ore = oreTotaliOpzione(selected);
    if (ore <= 0) return 0;
    return Math.max(1, Math.ceil(ore / ORE_GIORNO_STANDARD_CICLO));
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
          tempoMultiplo: d.tempoMultiplo,
          tempoOpzioni: d.tempoOpzioni,
          selectedOpzioneId: d.selectedOpzioneId,
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
