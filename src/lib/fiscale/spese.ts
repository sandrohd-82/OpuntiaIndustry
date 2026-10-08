import { z } from "zod";
import { imponibileDaImportoComprensivo } from "@/lib/amministrazione/fattura-a4-documento";

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
export const TIPI_SOGGETTO_PARTECIPANTE = [
  "operatore",
  "referente",
  "cliente",
  "cliente_possibile",
] as const;

export type CategoriaSpesa = (typeof CATEGORIE_SPESA)[number];
export type PagamentoSpesa = (typeof PAGAMENTI_SPESA)[number];
export type TipoCaricamentoSpesa = (typeof TIPI_CARICAMENTO_SPESA)[number];
export type StatoSpesa = (typeof STATI_SPESA)[number];
export type StatoProgettoSpesa = (typeof STATI_PROGETTO_SPESA)[number];
export type TipoProgettoSpesa = (typeof TIPI_PROGETTO_SPESA)[number];
export type TipoSoggettoPartecipante = (typeof TIPI_SOGGETTO_PARTECIPANTE)[number];

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

export const LABEL_SOGGETTO_PARTECIPANTE: Record<TipoSoggettoPartecipante, string> = {
  operatore: "Operatore",
  referente: "Referente",
  cliente: "Cliente",
  cliente_possibile: "Possibile cliente",
};

/** Null se il giorno o l'arco sta dentro le date del progetto. */
export function errorePeriodoPartecipante(
  progettoInizio: string,
  progettoFine: string | null,
  inizio: string,
  fine: string | null
): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(progettoInizio) || !/^\d{4}-\d{2}-\d{2}$/.test(inizio)) {
    return "Data non valida.";
  }
  if (fine && !/^\d{4}-\d{2}-\d{2}$/.test(fine)) return "Data fine non valida.";
  if (fine && fine < inizio) return "La data fine non può precedere l'inizio.";
  if (inizio < progettoInizio) {
    return "La data del partecipante precede l'inizio del progetto.";
  }
  if (progettoFine && (fine ?? inizio) > progettoFine) {
    return "Il periodo del partecipante esce dalle date del progetto.";
  }
  return null;
}

export function periodiPartecipanteSovrapposti(
  aInizio: string,
  aFine: string | null,
  bInizio: string,
  bFine: string | null
): boolean {
  const aEnd = aFine ?? aInizio;
  const bEnd = bFine ?? bInizio;
  return aInizio <= bEnd && bInizio <= aEnd;
}

export const partecipanteSpesaSchema = z
  .object({
    soggettoTipo: z.enum(TIPI_SOGGETTO_PARTECIPANTE),
    soggettoId: z.string().uuid("Scegli un partecipante."),
    dataInizio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data del partecipante non valida."),
    dataFine: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable(),
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
    prezziIvaCompresa: z.boolean().default(false),
    privaIva: z.boolean().default(false),
    righe: z
      .array(
        z.object({
          descrizione: z
            .string()
            .trim()
            .min(1, "Ogni riga ha una descrizione.")
            .max(300),
          quantita: z
            .number()
            .positive("Il numero di pezzi deve essere maggiore di zero.")
            .max(1_000_000),
          prezzoUnitario: z.number().min(0).max(1_000_000),
          imponibile: z.number().min(0).max(1_000_000),
          aliquotaIva: z.number().min(0).max(100),
        })
      )
      .max(80)
      .default([]),
  })
  .superRefine((value, ctx) => {
    if (value.privaIva && value.tipoCaricamento !== "scontrino") {
      ctx.addIssue({
        code: "custom",
        path: ["privaIva"],
        message: "La ricevuta priva di IVA si usa solo sullo scontrino.",
      });
    }
    if (value.privaIva && (value.imposta > 0.001 || value.aliquotaIva > 0)) {
      ctx.addIssue({
        code: "custom",
        path: ["imposta"],
        message: "Una ricevuta priva di IVA non ha imposta.",
      });
    }
    if (value.tipoCaricamento === "scontrino" && value.righe.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["righe"],
        message: "Aggiungi almeno una riga con descrizione, prezzo, numero e IVA.",
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
    partecipanti: z.array(partecipanteSpesaSchema).max(80).default([]),
  })
  .superRefine((value, ctx) => {
    if (value.dataFine && value.dataFine < value.dataInizio) {
      ctx.addIssue({
        code: "custom",
        path: ["dataFine"],
        message: "La data fine non può precedere l'inizio.",
      });
    }
    value.partecipanti.forEach((persona, index) => {
      const msg = errorePeriodoPartecipante(
        value.dataInizio,
        value.dataFine,
        persona.dataInizio,
        persona.dataFine
      );
      if (msg) {
        ctx.addIssue({
          code: "custom",
          path: ["partecipanti", index, "dataInizio"],
          message: msg,
        });
      }
      const sovrapposto = value.partecipanti.slice(0, index).some(
        (altro) =>
          altro.soggettoTipo === persona.soggettoTipo &&
          altro.soggettoId === persona.soggettoId &&
          periodiPartecipanteSovrapposti(
            altro.dataInizio,
            altro.dataFine,
            persona.dataInizio,
            persona.dataFine
          )
      );
      if (sovrapposto) {
        ctx.addIssue({
          code: "custom",
          path: ["partecipanti", index, "soggettoId"],
          message: "Questo partecipante ha già un periodo che si sovrappone.",
        });
      }
    });
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
  prezziIvaCompresa: boolean;
  privaIva: boolean;
  righe: SpesaRigaView[];
};

export type SpesaRigaView = {
  descrizione: string;
  quantita: number;
  prezzoUnitario: number;
  imponibile: number;
  aliquotaIva: number;
  imposta: number;
  totale: number;
};

export type RigaScontrinoInput = {
  descrizione: string;
  quantita: number;
  prezzoUnitario: number;
  aliquotaIva: number;
};

export type RigaScontrinoCalcolata = RigaScontrinoInput & {
  imponibile: number;
  imposta: number;
  totale: number;
};

function euro2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function qty3(value: number): number {
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
}

/**
 * Se i prezzi sono IVA compresa, prezzo × numero è il totale.
 * Imponibile e IVA si scorporano con l'aliquota della riga.
 * Altrimenti prezzo × numero è l'imponibile e l'IVA si aggiunge.
 */
export function calcolaRigheScontrino(
  righe: RigaScontrinoInput[],
  prezziIvaCompresa = false
): {
  righe: RigaScontrinoCalcolata[];
  imponibile: number;
  aliquotaIva: number;
  imposta: number;
  totale: number;
} {
  const calcolate = righe.map((riga) => {
    const quantita = qty3(riga.quantita);
    const prezzoUnitario = euro2(riga.prezzoUnitario);
    const aliquotaIva = euro2(riga.aliquotaIva);
    const importo = euro2(prezzoUnitario * quantita);
    const imponibile = prezziIvaCompresa
      ? (aliquotaIva > 0
          ? imponibileDaImportoComprensivo(importo, aliquotaIva)
          : importo)
      : importo;
    const imposta = prezziIvaCompresa
      ? euro2(importo - imponibile)
      : euro2(imponibile * (aliquotaIva / 100));
    const totale = prezziIvaCompresa ? importo : euro2(imponibile + imposta);
    return {
      descrizione: riga.descrizione.trim(),
      quantita,
      prezzoUnitario,
      imponibile,
      aliquotaIva,
      imposta,
      totale,
    };
  });
  const imponibile = euro2(calcolate.reduce((sum, riga) => sum + riga.imponibile, 0));
  const totaleInserito = euro2(calcolate.reduce((sum, riga) => sum + riga.totale, 0));
  const imposta = prezziIvaCompresa
    ? euro2(totaleInserito - imponibile)
    : euro2(calcolate.reduce((sum, riga) => sum + riga.imposta, 0));
  const totale = prezziIvaCompresa ? totaleInserito : euro2(imponibile + imposta);
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
  conteggioPartecipanti: number;
  totale: number;
};

export type SoggettoPartecipanteOption = {
  id: string;
  tipo: TipoSoggettoPartecipante;
  etichetta: string;
};

export type PartecipanteProgettoView = {
  id: string;
  soggettoTipo: TipoSoggettoPartecipante;
  soggettoId: string;
  etichetta: string;
  dataInizio: string;
  dataFine: string | null;
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
