import { z } from "zod";

export const SPESE_BUCKET = "spese-documenti";
export const SPESE_MAX_BYTES = 8 * 1024 * 1024;

export const CATEGORIE_SPESA = [
  "vitto",
  "alloggio",
  "trasporti",
  "carburante_automezzi",
  "carburante_impianti",
  "cancelleria",
  "ufficio",
  "altro",
] as const;

export const PAGAMENTI_SPESA = [
  "anticipo_dipendente",
  "carta_aziendale",
  "conto_aziendale",
] as const;

export const TIPI_CARICAMENTO_SPESA = [
  "scontrino",
  "fattura_estera",
  "xml",
] as const;

export const STATI_SPESA = [
  "bozza",
  "registrato",
  "contabilizzato",
  "annullato",
] as const;

export const STATI_PROGETTO_SPESA = ["bozza", "approvato", "chiuso"] as const;
export const TIPI_PROGETTO_SPESA = ["progetto", "trasferta"] as const;

export type CategoriaSpesa = (typeof CATEGORIE_SPESA)[number];
export type PagamentoSpesa = (typeof PAGAMENTI_SPESA)[number];
export type TipoCaricamentoSpesa = (typeof TIPI_CARICAMENTO_SPESA)[number];
export type StatoSpesa = (typeof STATI_SPESA)[number];
export type StatoProgettoSpesa = (typeof STATI_PROGETTO_SPESA)[number];
export type TipoProgettoSpesa = (typeof TIPI_PROGETTO_SPESA)[number];

const CATEGORIE_CON_CAUSALE = new Set<CategoriaSpesa>([
  "cancelleria",
  "ufficio",
  "altro",
]);

export function categoriaRichiedeCausale(categoria: CategoriaSpesa): boolean {
  return CATEGORIE_CON_CAUSALE.has(categoria);
}

export const LABEL_CATEGORIA_SPESA: Record<CategoriaSpesa, string> = {
  vitto: "Vitto",
  alloggio: "Alloggio",
  trasporti: "Trasporti",
  carburante_automezzi: "Carburante automezzi",
  carburante_impianti: "Carburante impianti e attrezzature",
  cancelleria: "Cancelleria",
  ufficio: "Ufficio",
  altro: "Altro",
};

export const LABEL_PAGAMENTO_SPESA: Record<PagamentoSpesa, string> = {
  anticipo_dipendente: "Anticipo dipendente/socio",
  carta_aziendale: "Carta aziendale",
  conto_aziendale: "Conto aziendale",
};

export const LABEL_TIPO_CARICAMENTO: Record<TipoCaricamentoSpesa, string> = {
  scontrino: "Scontrino o piccola spesa",
  fattura_estera: "Fattura estera",
  xml: "Fattura elettronica XML",
};

export const LABEL_STATO_SPESA: Record<StatoSpesa, string> = {
  bozza: "Bozza",
  registrato: "Registrato",
  contabilizzato: "Contabilizzato",
  annullato: "Annullato",
};

export const LABEL_STATO_PROGETTO: Record<StatoProgettoSpesa, string> = {
  bozza: "Bozza",
  approvato: "Approvato",
  chiuso: "Chiuso",
};

export const LABEL_TIPO_PROGETTO: Record<TipoProgettoSpesa, string> = {
  progetto: "Progetto",
  trasferta: "Viaggio di lavoro",
};

const categoriaSchema = z.enum(CATEGORIE_SPESA);
const pagamentoSchema = z.enum(PAGAMENTI_SPESA);
const tipoSchema = z.enum(TIPI_CARICAMENTO_SPESA);

export const spesaRegistrazioneSchema = z
  .object({
    tipoCaricamento: tipoSchema,
    categoria: categoriaSchema,
    modalitaPagamento: pagamentoSchema,
    esercente: z.string().trim().min(1, "Indica l'esercente o il fornitore.").max(200),
    partitaIva: z.string().trim().max(32).default(""),
    dataDocumento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data non valida."),
    giustificazione: z.string().trim().max(500).default(""),
    imponibile: z.number().min(0).max(1_000_000),
    aliquotaIva: z.number().min(0).max(100),
    imposta: z.number().min(0).max(1_000_000),
    totale: z.number().positive("Il totale deve essere maggiore di zero.").max(1_000_000),
    valuta: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{3}$/, "Valuta di 3 lettere, es. EUR.")
      .default("EUR"),
    importoValuta: z.number().min(0).max(1_000_000).nullable().default(null),
    cambio: z.number().positive().max(1_000_000).nullable().default(null),
    nazione: z.string().trim().max(80).default(""),
    flagEsterometro: z.boolean().default(false),
    tipoAutofattura: z.enum(["", "TD17", "TD18"]).default(""),
    progettoId: z.string().uuid().nullable().default(null),
    note: z.string().trim().max(1000).default(""),
    letturaAutomatica: z.boolean().default(false),
    righe: z
      .array(
        z.object({
          descrizione: z
            .string()
            .trim()
            .min(1, "Ogni riga ha una descrizione.")
            .max(300),
          imponibile: z.number().min(0).max(1_000_000),
          aliquotaIva: z.number().min(0).max(100),
        })
      )
      .max(80)
      .default([]),
  })
  .superRefine((value, ctx) => {
    if (value.tipoCaricamento === "scontrino" && value.righe.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["righe"],
        message: "Aggiungi almeno una riga con descrizione, imponibile e IVA.",
      });
    }
    if (
      categoriaRichiedeCausale(value.categoria) &&
      value.giustificazione.length === 0
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["giustificazione"],
        message: "Per cancelleria, ufficio e altre spese minute la causale è obbligatoria.",
      });
    }
    if (value.tipoCaricamento === "fattura_estera" && value.nazione.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["nazione"],
        message: "Indica la nazione del fornitore.",
      });
    }
    const somma = Math.round((value.imponibile + value.imposta) * 100) / 100;
    const totale = Math.round(value.totale * 100) / 100;
    if (Math.abs(somma - totale) > 0.05) {
      ctx.addIssue({
        code: "custom",
        path: ["totale"],
        message: "Imponibile e IVA non tornano con il totale.",
      });
    }
  });

export type SpesaRegistrazioneInput = z.infer<typeof spesaRegistrazioneSchema>;

export const progettoSpesaSchema = z
  .object({
    tipo: z.enum(TIPI_PROGETTO_SPESA),
    titolo: z.string().trim().min(1, "Indica un titolo.").max(160),
    descrizione: z.string().trim().max(1000).default(""),
    dataInizio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inizio non valida."),
    dataFine: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .default(null),
  })
  .superRefine((value, ctx) => {
    if (value.dataFine && value.dataFine < value.dataInizio) {
      ctx.addIssue({
        code: "custom",
        path: ["dataFine"],
        message: "La data fine non può precedere l'inizio.",
      });
    }
  });

export type SpesaDocumentoView = {
  id: string;
  tipoCaricamento: TipoCaricamentoSpesa;
  categoria: CategoriaSpesa;
  modalitaPagamento: PagamentoSpesa;
  esercente: string;
  partitaIva: string;
  dataDocumento: string;
  giustificazione: string;
  imponibile: number;
  aliquotaIva: number;
  imposta: number;
  totale: number;
  valuta: string;
  importoValuta: number | null;
  cambio: number | null;
  nazione: string;
  flagEsterometro: boolean;
  tipoAutofattura: "" | "TD17" | "TD18";
  progettoId: string | null;
  progettoTitolo: string | null;
  stato: StatoSpesa;
  versione: number;
  fileName: string;
  letturaAutomatica: boolean;
  note: string;
  contabilizzatoAt: string | null;
  righe: SpesaRigaView[];
};

export type SpesaRigaView = {
  descrizione: string;
  imponibile: number;
  aliquotaIva: number;
  imposta: number;
  totale: number;
};

export type RigaScontrinoInput = {
  descrizione: string;
  imponibile: number;
  aliquotaIva: number;
};

export type RigaScontrinoCalcolata = RigaScontrinoInput & {
  imposta: number;
  totale: number;
};

function euro2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Imposta e totale di riga si calcolano da imponibile e aliquota. */
export function calcolaRigheScontrino(righe: RigaScontrinoInput[]): {
  righe: RigaScontrinoCalcolata[];
  imponibile: number;
  aliquotaIva: number;
  imposta: number;
  totale: number;
} {
  const calcolate = righe.map((riga) => {
    const imponibile = euro2(riga.imponibile);
    const aliquotaIva = euro2(riga.aliquotaIva);
    const imposta = euro2(imponibile * (aliquotaIva / 100));
    const totale = euro2(imponibile + imposta);
    return {
      descrizione: riga.descrizione.trim(),
      imponibile,
      aliquotaIva,
      imposta,
      totale,
    };
  });
  const imponibile = euro2(calcolate.reduce((sum, riga) => sum + riga.imponibile, 0));
  const imposta = euro2(calcolate.reduce((sum, riga) => sum + riga.imposta, 0));
  const totale = euro2(imponibile + imposta);
  const aliquote = [...new Set(calcolate.map((riga) => riga.aliquotaIva))];
  const aliquotaIva = aliquote.length === 1 ? (aliquote[0] ?? 0) : 0;
  return { righe: calcolate, imponibile, aliquotaIva, imposta, totale };
}

export type SpesaProgettoView = {
  id: string;
  tipo: TipoProgettoSpesa;
  titolo: string;
  descrizione: string;
  dataInizio: string;
  dataFine: string | null;
  documentoStato: StatoProgettoSpesa;
  versione: number;
  conteggioDocumenti: number;
  totale: number;
};

export type RigaLetturaSpesa = {
  descrizione: string;
  quantita: number | null;
  imponibile: number | null;
  aliquotaIva: number | null;
  imposta: number | null;
  totale: number | null;
};

export type ValenzaFiscaleSpesa = "fiscale" | "commerciale" | "fattura";

export type AnteprimaSpesa = {
  esercente: string;
  partitaIva: string;
  partitaIvaAcquirente: string;
  dataDocumento: string;
  imponibile: number | null;
  aliquotaIva: number | null;
  imposta: number | null;
  totale: number | null;
  nazione: string;
  valuta: string;
  righe: RigaLetturaSpesa[];
  lettura: "xml" | "pdf" | "ocr" | "manuale";
  letturaJson: Record<string, unknown> | null;
  uscitaImporto: number | null;
  ivaDetraibile: boolean;
  valenzaFiscale: ValenzaFiscaleSpesa;
  avviso: string;
};
