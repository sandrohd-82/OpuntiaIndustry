import { z } from "zod";
import {
  clampSconto,
  importoRiga,
  roundMoney,
  year2FromDate,
} from "@/lib/amministrazione/fatture";

/** Prefisso interno Opuntia (non inviato a FiC come numero fattura). */
export const NUMERO_INTERNO_PREFIX = "Ft-";

export const CODICE_RIGA_SPEDIZIONE = "SPED";

export const PAYMENT_METHODS = [
  { code: "MP05", label: "Bonifico" },
  { code: "MP01", label: "Contanti" },
  { code: "MP08", label: "Carta di pagamento" },
  { code: "MP02", label: "Assegno" },
  { code: "MP12", label: "RIBA" },
  { code: "MP19", label: "SEPA Direct Debit" },
] as const;

export type PaymentMethodCode = (typeof PAYMENT_METHODS)[number]["code"];

export type EmissioneRigaInput = {
  prodottoId: string | null;
  codice: string;
  /** Nome/descrizione prodotto (evidenziata). */
  descrizione: string;
  /** Note prodotto (meno evidenziate in UI; andranno a capo sotto la descrizione). */
  note: string;
  quantita: number;
  prezzoUnitario: number;
  scontoPercentuale: number;
  ivaPercentuale: number;
  isSpedizione: boolean;
};

export type EmissioneInput = {
  clienteId: string;
  dataDocumento: string;
  dataScadenza: string;
  paymentMethod: PaymentMethodCode;
  iban: string;
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
  prezzoUnitario: z.number().min(0),
  scontoPercentuale: z.number().min(0).max(100).optional().default(0),
  ivaPercentuale: z.number().min(0).max(100),
  isSpedizione: z.boolean().optional().default(false),
});

export const emissioneInputSchema = z
  .object({
    clienteId: z.string().uuid("Cliente non valido"),
    dataDocumento: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Data documento non valida"),
    dataScadenza: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Data scadenza non valida"),
    paymentMethod: z.enum([
      "MP05",
      "MP01",
      "MP08",
      "MP02",
      "MP12",
      "MP19",
    ]),
    iban: z.string().optional().default(""),
    sendToSdi: z.boolean().optional().default(true),
    sendCourtesyEmail: z.boolean().optional().default(true),
    dryRunSdi: z.boolean().optional().default(false),
    ordineId: z.string().uuid().nullable().optional().default(null),
    noteDocumento: z.string().optional().default(""),
    righe: z.array(rigaSchema).min(1, "Aggiungi almeno una riga"),
  })
  .superRefine((v, ctx) => {
    if (v.paymentMethod === "MP05" && !v.iban.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "IBAN obbligatorio per il bonifico.",
        path: ["iban"],
      });
    }
    const hasProduct = v.righe.some((r) => !r.isSpedizione);
    if (!hasProduct) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Aggiungi almeno un prodotto oltre alla spedizione.",
        path: ["righe"],
      });
    }
  })
  .transform((v) => ({
    ...v,
    iban: v.iban.trim().toUpperCase().replace(/\s+/g, ""),
    noteDocumento: v.noteDocumento.trim(),
    ordineId: v.ordineId ?? null,
    righe: v.righe.map((r) => {
      const sconto = clampSconto(r.scontoPercentuale ?? 0);
      return {
        prodottoId: r.prodottoId,
        codice: r.codice.trim(),
        descrizione: r.descrizione.trim(),
        note: (r.note ?? "").trim(),
        quantita: r.quantita,
        prezzoUnitario: r.prezzoUnitario,
        scontoPercentuale: sconto,
        ivaPercentuale: r.isSpedizione && r.ivaPercentuale < 0 ? 0 : r.ivaPercentuale,
        isSpedizione: Boolean(r.isSpedizione),
        importo: importoRiga(r.quantita, r.prezzoUnitario, sconto),
      };
    }),
  }));

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
 * Split per FiC. Il numero visibile è number + numeration.
 * 26/0001 → number 26, numeration "/0001".
 * Storico 26-C005/1 resta leggibile allo stesso modo.
 * L'account FiC non deve aggiungere l'anno in coda, altrimenti compare /2026.
 */
export function splitNumeroForFic(numeroFattura: string): {
  number: number;
  numeration: string;
} {
  const raw = numeroFattura.trim();
  const nuovo = raw.match(/^(\d{2})\/(\d{4})$/);
  if (nuovo) {
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
    prezzoUnitario: 0,
    scontoPercentuale: 0,
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
    prezzoUnitario: importo,
    scontoPercentuale: 0,
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
