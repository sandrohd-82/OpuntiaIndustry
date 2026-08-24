import { z } from "zod";

export const contrattoTipologiaSchema = z.enum([
  "affitto",
  "noleggio",
  "leasing",
  "servizio",
  "altro",
]);
export type ContrattoTipologia = z.infer<typeof contrattoTipologiaSchema>;

export const contrattoPeriodicitaSchema = z.enum([
  "una_tantum",
  "mensile",
  "trimestrale",
  "annuale",
]);
export type ContrattoPeriodicita = z.infer<typeof contrattoPeriodicitaSchema>;

export const contrattoStatoSchema = z.enum([
  "bozza",
  "attivo",
  "scaduto",
  "archiviato",
]);
export type ContrattoStato = z.infer<typeof contrattoStatoSchema>;

export const TIPOLOGIA_LABEL: Record<ContrattoTipologia, string> = {
  affitto: "Affitto",
  noleggio: "Noleggio",
  leasing: "Leasing",
  servizio: "Servizio",
  altro: "Altro",
};

export const PERIODICITA_LABEL: Record<ContrattoPeriodicita, string> = {
  una_tantum: "Una tantum",
  mensile: "Mensile",
  trimestrale: "Trimestrale",
  annuale: "Annuale",
};

export const STATO_LABEL: Record<ContrattoStato, string> = {
  bozza: "Bozza",
  attivo: "Attivo",
  scaduto: "Scaduto",
  archiviato: "Archiviato",
};

export const createContrattoSchema = z
  .object({
    tipologia: contrattoTipologiaSchema,
    oggetto: z.string().trim().min(1).max(300),
    controparteNome: z.string().trim().max(200).default(""),
    importo: z.number().finite().nonnegative(),
    periodicita: contrattoPeriodicitaSchema,
    ivaPercentuale: z.number().finite().min(0).max(100).nullable().optional(),
    haPeriodo: z.boolean(),
    dataInizio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    dataFine: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    aTempoIndeterminato: z.boolean().default(false),
    sostituisceFattura: z.boolean(),
    pagamentoSoggettoAFattura: z.boolean(),
    note: z.string().trim().max(5000).optional().default(""),
    stato: contrattoStatoSchema.optional().default("attivo"),
  })
  .superRefine((v, ctx) => {
    if (v.sostituisceFattura === v.pagamentoSoggettoAFattura) {
      ctx.addIssue({
        code: "custom",
        message:
          "Scegli: il contratto sostituisce la fattura OPPURE il pagamento è soggetto a fattura.",
        path: ["sostituisceFattura"],
      });
    }
    if (v.haPeriodo) {
      if (!v.dataInizio) {
        ctx.addIssue({
          code: "custom",
          message: "Data inizio obbligatoria se il periodo è attivo.",
          path: ["dataInizio"],
        });
      }
      if (!v.aTempoIndeterminato) {
        if (!v.dataFine) {
          ctx.addIssue({
            code: "custom",
            message: "Data fine obbligatoria se non è a tempo indeterminato.",
            path: ["dataFine"],
          });
        } else if (v.dataInizio && v.dataFine < v.dataInizio) {
          ctx.addIssue({
            code: "custom",
            message: "La data fine deve essere ≥ data inizio.",
            path: ["dataFine"],
          });
        }
      }
    }
  });

export type ContrattoFiscale = {
  id: string;
  tipologia: ContrattoTipologia;
  oggetto: string;
  controparteNome: string;
  anagraficaId: string | null;
  importo: number;
  valuta: string;
  periodicita: ContrattoPeriodicita;
  ivaPercentuale: number | null;
  haPeriodo: boolean;
  dataInizio: string | null;
  dataFine: string | null;
  aTempoIndeterminato: boolean;
  sostituisceFattura: boolean;
  pagamentoSoggettoAFattura: boolean;
  note: string;
  allegatoPath: string | null;
  allegatoNome: string | null;
  stato: ContrattoStato;
  versione: number;
  createdAt: string;
  updatedAt: string;
};

export function mapContratto(row: {
  id: string;
  tipologia: string;
  oggetto: string;
  controparte_nome: string | null;
  anagrafica_id: string | null;
  importo: number | string;
  valuta: string;
  periodicita: string;
  iva_percentuale: number | string | null;
  ha_periodo: boolean;
  data_inizio: string | null;
  data_fine: string | null;
  a_tempo_indeterminato: boolean;
  sostituisce_fattura: boolean;
  pagamento_soggetto_a_fattura: boolean;
  note: string | null;
  allegato_path: string | null;
  allegato_nome: string | null;
  stato: string;
  versione: number;
  created_at: string;
  updated_at: string;
}): ContrattoFiscale {
  return {
    id: row.id,
    tipologia: row.tipologia as ContrattoTipologia,
    oggetto: row.oggetto,
    controparteNome: row.controparte_nome ?? "",
    anagraficaId: row.anagrafica_id,
    importo: Number(row.importo) || 0,
    valuta: row.valuta || "EUR",
    periodicita: row.periodicita as ContrattoPeriodicita,
    ivaPercentuale:
      row.iva_percentuale == null ? null : Number(row.iva_percentuale),
    haPeriodo: Boolean(row.ha_periodo),
    dataInizio: row.data_inizio,
    dataFine: row.data_fine,
    aTempoIndeterminato: Boolean(row.a_tempo_indeterminato),
    sostituisceFattura: Boolean(row.sostituisce_fattura),
    pagamentoSoggettoAFattura: Boolean(row.pagamento_soggetto_a_fattura),
    note: row.note ?? "",
    allegatoPath: row.allegato_path,
    allegatoNome: row.allegato_nome,
    stato: row.stato as ContrattoStato,
    versione: row.versione,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const CONTRATTO_SELECT =
  "id, tipologia, oggetto, controparte_nome, anagrafica_id, importo, valuta, periodicita, iva_percentuale, ha_periodo, data_inizio, data_fine, a_tempo_indeterminato, sostituisce_fattura, pagamento_soggetto_a_fattura, note, allegato_path, allegato_nome, stato, versione, created_at, updated_at";
