import { z } from "zod";
import {
  clampSconto,
  importoRiga,
  roundMoney,
  year2FromDate,
} from "@/lib/amministrazione/fatture";
import {
  notaConMarcaSconti,
  prezzoNettoDueSconti,
} from "@/lib/amministrazione/sconto-fuori-listino";
import { AGRINSICILIA_COORDINATE } from "@/lib/amministrazione/preventivo-letterhead";
import {
  applyTotaleToPiano,
  ordinePagamentoPianoSchema,
  pianoToFicPayments,
  type OrdinePagamentoPiano,
} from "@/lib/amministrazione/ordine-pagamento-piano";

/** Prefisso interno Opuntia (non inviato a FiC come numero fattura). */
export const NUMERO_INTERNO_PREFIX = "Ft-";

export const CODICE_RIGA_SPEDIZIONE = "SPED";

/** Come la fattura da ordine: sempre bonifico, IBAN già in anagrafica. */
export const PAGAMENTO_FATTURA_METODO = "MP05" as const;

export type EmissioneRigaInput = {
  prodottoId: string | null;
  codice: string;
  /** Nome/descrizione prodotto (evidenziata). */
  descrizione: string;
  /** Note prodotto (meno evidenziate in UI; andranno a capo sotto la descrizione). */
  note: string;
  quantita: number;
  unitaMisura: string;
  prezzoUnitario: number;
  scontoPercentuale: number;
  /** Sconto di listino per quantità, applicato per primo. */
  scontoListinoPct: number;
  /** Sconto extra, applicato sul prezzo già scontato di listino. */
  scontoExtraPct: number;
  ivaPercentuale: number;
  isSpedizione: boolean;
};

export type EmissioneInput = {
  clienteId: string;
  dataDocumento: string;
  /** Per calcolare la scadenza, come la data consegna dell’ordine. */
  dataConsegna: string | null;
  piano: OrdinePagamentoPiano;
  /** Invia fattura elettronica allo SDI. */
  sendToSdi: boolean;
  /** Mail di cortesia al cliente. */
  sendCourtesyEmail: boolean;
  /** Dry-run SDI (solo test). */
  dryRunSdi: boolean;
  ordineId: string | null;
  noteDocumento: string;
  righe: EmissioneRigaInput[];
};

const rigaSchema = z.object({
  prodottoId: z.string().uuid().nullable(),
  codice: z.string().trim().min(1, "Codice obbligatorio"),
  descrizione: z.string().trim().min(1, "Descrizione obbligatoria"),
  note: z.string().optional().default(""),
  quantita: z.number().positive("Quantità deve essere > 0"),
  unitaMisura: z.string().trim().optional().default("kg"),
  prezzoUnitario: z.number().min(0),
  scontoPercentuale: z.number().min(0).max(100).optional().default(0),
  scontoListinoPct: z.number().min(0).max(100).optional().default(0),
  scontoExtraPct: z.number().min(0).max(100).optional().default(0),
  ivaPercentuale: z.number().min(0).max(100),
  isSpedizione: z.boolean().optional().default(false),
});

export const emissioneInputSchema = z
  .object({
    clienteId: z.string().uuid("Cliente non valido"),
    dataDocumento: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Data documento non valida"),
    dataConsegna: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Data consegna non valida")
      .nullable()
      .optional()
      .default(null),
    piano: ordinePagamentoPianoSchema,
    sendToSdi: z.boolean().optional().default(true),
    sendCourtesyEmail: z.boolean().optional().default(true),
    dryRunSdi: z.boolean().optional().default(false),
    ordineId: z.string().uuid().nullable().optional().default(null),
    prenotazioneId: z.string().uuid().nullable().optional().default(null),
    noteDocumento: z.string().optional().default(""),
    righe: z.array(rigaSchema).min(1, "Aggiungi almeno una riga"),
  })
  .superRefine((v, ctx) => {
    const hasProduct = v.righe.some((r) => !r.isSpedizione);
    if (!hasProduct) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Aggiungi almeno un prodotto oltre alla spedizione.",
        path: ["righe"],
      });
    }
  })
  .transform((v) => {
    const righe = v.righe.map((r) => {
      const listino = clampSconto(r.scontoListinoPct ?? 0);
      const extra = clampSconto(r.scontoExtraPct ?? 0);
      const dueSconti = listino > 0 || extra > 0;
      const sconto = dueSconti ? 0 : clampSconto(r.scontoPercentuale ?? 0);
      return {
        prodottoId: r.prodottoId,
        codice: r.codice.trim(),
        descrizione: r.descrizione.trim(),
        note: notaConMarcaSconti((r.note ?? "").trim(), listino, extra),
        quantita: r.quantita,
        unitaMisura: (r.unitaMisura ?? "kg").trim() || "kg",
        prezzoUnitario: r.prezzoUnitario,
        scontoPercentuale: sconto,
        scontoListinoPct: listino,
        scontoExtraPct: extra,
        ivaPercentuale: r.isSpedizione && r.ivaPercentuale < 0 ? 0 : r.ivaPercentuale,
        isSpedizione: Boolean(r.isSpedizione),
        importo: importoEmissioneRiga({
          quantita: r.quantita,
          prezzoUnitario: r.prezzoUnitario,
          scontoPercentuale: sconto,
          scontoListinoPct: listino,
          scontoExtraPct: extra,
        }),
      };
    });
    const totals = calcolaTotaliEmissione(righe);
    const piano = applyTotaleToPiano(v.piano, totals.totale);
    const payments = pianoToFicPayments({
      piano,
      oggi: v.dataDocumento,
      dataConsegna: v.dataConsegna,
    });
    return {
      ...v,
      noteDocumento: v.noteDocumento.trim(),
      ordineId: v.ordineId ?? null,
      paymentMethod: PAGAMENTO_FATTURA_METODO,
      iban: AGRINSICILIA_COORDINATE.iban,
      dataScadenza: payments[0]?.due_date ?? v.dataDocumento,
      piano,
      payments,
      righe,
    };
  });

export type EmissioneParsed = z.infer<typeof emissioneInputSchema>;

/** Ft-26/0001 → 26/0001. Storico Ft-26-C005/1 → 26-C005/1. */
export function toNumeroFatturaGestionale(numeroInterno: string): string {
  const s = numeroInterno.trim();
  if (s.toUpperCase().startsWith("FT-")) return s.slice(3);
  return s;
}

/** Descrizione inviata a FiC: nome + a capo + note. */
export function buildDescrizioneDocumento(
  descrizione: string,
  note: string
): string {
  const d = descrizione.trim();
  const n = note.trim();
  if (!n) return d;
  return `${d}\n${n}`;
}

/** Listino e extra restano due percentuali. L'importo è il netto unico inviato allo SDI. */
export function importoEmissioneRiga(r: {
  quantita: number;
  prezzoUnitario: number;
  scontoPercentuale?: number;
  scontoListinoPct?: number;
  scontoExtraPct?: number;
}): number {
  const listino = r.scontoListinoPct ?? 0;
  const extra = r.scontoExtraPct ?? 0;
  if (listino > 0 || extra > 0) {
    return roundMoney(
      r.quantita * prezzoNettoDueSconti(r.prezzoUnitario, listino, extra)
    );
  }
  return importoRiga(r.quantita, r.prezzoUnitario, r.scontoPercentuale ?? 0);
}

export function calcolaTotaliEmissione(
  righe: Array<{ importo: number; ivaPercentuale: number }>
): { imponibile: number; imposta: number; totale: number } {
  let imponibile = 0;
  let imposta = 0;
  for (const r of righe) {
    imponibile += r.importo;
    imposta += (r.importo * r.ivaPercentuale) / 100;
  }
  return {
    imponibile: roundMoney(imponibile),
    imposta: roundMoney(imposta),
    totale: roundMoney(imponibile + imposta),
  };
}

/**
 * Split per l'API Fatture in Cloud.
 * Fino al 2026 il gestionale e i PDF usano NN/ANNO (22/2026).
 * All'API si manda solo il progressivo (22): l'anno lo aggiunge Fatture in Cloud
 * prima della trasmissione allo SDI. La numeration resta vuota, così non
 * diventa 22/2026/2026.
 * Dal 2027 il formato YY/CCCC si spezza ancora in number + numeration.
 */
export function splitNumeroForFic(numeroFattura: string): {
  number: number;
  numeration: string;
} {
  const raw = numeroFattura.trim();
  const perAnno = raw.match(/^(\d+)\/(20\d{2})$/);
  if (perAnno && Number(perAnno[2]) <= 2026) {
    return { number: Number(perAnno[1]), numeration: "" };
  }
  const nuovo = raw.match(/^(\d{2})\/(\d{4})$/);
  if (nuovo && Number(nuovo[2]) < 2000) {
    return { number: Number(nuovo[1]), numeration: `/${nuovo[2]}` };
  }
  const storico = raw.match(/^(\d{2})-([A-Z0-9]+)\/(\d+)$/i);
  if (storico) {
    return {
      number: Number(storico[1]),
      numeration: `-${storico[2].toUpperCase()}/${storico[3]}`,
    };
  }
  return { number: 1, numeration: `/${raw}` };
}

/** Solo formattazione. Il progressivo vero lo assegna next_numero_fattura. */
export function buildNumeroInternoEmissione(input: {
  dataDocumento: string;
  seq: number;
}): { numeroInterno: string; numeroFattura: string } {
  const aa = year2FromDate(input.dataDocumento);
  const seq = Math.max(1, Math.min(9999, Math.floor(input.seq)));
  const numeroFattura = `${aa}/${String(seq).padStart(4, "0")}`;
  return {
    numeroInterno: `${NUMERO_INTERNO_PREFIX}${numeroFattura}`,
    numeroFattura,
  };
}

export function emptyEmissioneRiga(
  defaults?: Partial<EmissioneRigaInput>
): EmissioneRigaInput {
  return {
    prodottoId: null,
    codice: "",
    descrizione: "",
    note: "",
    quantita: 1,
    unitaMisura: "kg",
    prezzoUnitario: 0,
    scontoPercentuale: 0,
    scontoListinoPct: 0,
    scontoExtraPct: 0,
    ivaPercentuale: 22,
    isSpedizione: false,
    ...defaults,
  };
}

export function emptySpedizioneRiga(
  importo = 0,
  ivaApplicata = false,
  ivaPercentuale = 22
): EmissioneRigaInput {
  return {
    prodottoId: null,
    codice: CODICE_RIGA_SPEDIZIONE,
    descrizione: "Spedizione",
    note: "",
    quantita: 1,
    unitaMisura: "nr",
    prezzoUnitario: importo,
    scontoPercentuale: 0,
    scontoListinoPct: 0,
    scontoExtraPct: 0,
    ivaPercentuale: ivaApplicata ? ivaPercentuale : 0,
    isSpedizione: true,
  };
}

/** Aliquote tipiche + quelle da profilo cooperativa. */
export function aliquoteIvaOptions(
  tipiColture: Array<{ aliquota_iva?: number; percentuale_compensazione?: number }>
): number[] {
  const set = new Set<number>([0, 4, 5, 10, 22]);
  for (const t of tipiColture) {
    if (typeof t.aliquota_iva === "number") set.add(t.aliquota_iva);
    if (typeof t.percentuale_compensazione === "number") {
      set.add(t.percentuale_compensazione);
    }
  }
  return [...set].sort((a, b) => a - b);
}
