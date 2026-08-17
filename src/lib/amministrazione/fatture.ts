import { z } from "zod";
import type {
  FatturaDocumentoStato,
  FatturaEmessaDilazioneRow,
  FatturaEmessaRigaRow,
  FatturaEmessaRow,
  FatturaModalitaCollegamentoNc,
  FatturaNaturaDocumento,
  FatturaRicevutaDilazioneRow,
  FatturaRicevutaRigaRow,
  FatturaRicevutaRow,
  FatturaRimborsoMezzo,
  FatturaStatoIncassoNc,
  FatturaStatoPagamento,
} from "@/types/database";

export type FatturaKind = "emessa" | "ricevuta" | "nota_credito";

export type FatturaAllegatoMeta = {
  storagePath: string;
  fileName: string;
};

export type FatturaRiga = {
  id?: string;
  prodottoId: string | null;
  codice: string;
  descrizione: string;
  quantita: number;
  /** Unità di misura quantità (ricevute / SDI). Default NR. */
  unitaMisura?: string;
  /** Prezzo di listino (unitario). */
  prezzoUnitario: number;
  /** Sconto % sul listino (0–100). */
  scontoPercentuale: number;
  /** Aliquota IVA della riga (ricevute: per prodotto). */
  ivaPercentuale?: number;
  importo: number;
  /**
   * Bene ammortizzabile:
   * - ricevute → ingresso registro cespiti
   * - emesse → uscita registro cespiti
   * Solo se prezzo unitario di listino ≥ SOGLIA_BENE_AMMORTIZZABILE_EUR.
   */
  isBeneAmmortizzabile?: boolean;
};

/** Soglia fiscale beni strumentali di basso costo (EUR, listino unitario). */
export const SOGLIA_BENE_AMMORTIZZABILE_EUR = 516.46;

/** True se il prezzo unitario di listino consente il flag bene ammortizzabile. */
export function canFlagBeneAmmortizzabile(prezzoUnitario: number): boolean {
  return (
    Number.isFinite(prezzoUnitario) &&
    Math.abs(prezzoUnitario) >= SOGLIA_BENE_AMMORTIZZABILE_EUR
  );
}

export type FatturaDilazione = {
  id?: string;
  dataScadenza: string;
  importo: number;
  statoPagamento: FatturaStatoPagamento;
  note?: string;
};

export type Fattura = {
  id: string;
  kind: FatturaKind;
  numeroInterno: string;
  anagraficaId: string | null;
  anagraficaRagioneSociale: string;
  anagraficaCodiceTarga: string;
  dataEmissione: string;
  numeroDocumentoEsterno: string;
  ficId: number | null;
  spedizione: number;
  /** Default false: IVA non applicata alla spedizione. */
  spedizioneIvaApplicata: boolean;
  /** NC: se false il trasporto non riduce gli incassi. */
  spedizioneSottraiIncassi: boolean;
  imponibile: number;
  ivaPercentuale: number;
  imposta: number;
  totale: number;
  statoPagamento: FatturaStatoPagamento;
  /** Solo ricevute: acconto | saldo. Null per emesse/NC. */
  naturaDocumento: FatturaNaturaDocumento | null;
  statoIncassoNc: FatturaStatoIncassoNc | null;
  rimborsoNecessario: boolean | null;
  rimborsoMezzo: FatturaRimborsoMezzo | null;
  fatturaCompensativaId: string | null;
  modalitaCollegamento: FatturaModalitaCollegamentoNc | null;
  fatturaSostitutivaId: string | null;
  /** Solo dettaglio NC: n. interno fattura stornata. */
  fatturaCollegataNumeroInterno?: string | null;
  /** Solo dettaglio NC: n. interno fattura sostitutiva. */
  fatturaSostitutivaNumeroInterno?: string | null;
  /** Fattura stornata: id / n. interno della NC che l’ha annullata. */
  annullataDaNcId?: string | null;
  annullataDaNcNumeroInterno?: string | null;
  ricevuta: FatturaAllegatoMeta | null;
  versione: number;
  documentoStato: FatturaDocumentoStato;
  note: string;
  fatturaCollegataId: string | null;
  riferimentoFatturaEsterno: string;
  righe: FatturaRiga[];
  dilazioni: FatturaDilazione[];
  createdAt: string;
  updatedAt: string;
};

export type FatturaInput = {
  anagraficaId: string;
  anagraficaRagioneSociale: string;
  anagraficaCodiceTarga: string;
  dataEmissione: string;
  numeroDocumentoEsterno?: string;
  ficId?: number | null;
  spedizione: number;
  spedizioneIvaApplicata: boolean;
  spedizioneSottraiIncassi?: boolean;
  ivaPercentuale: number;
  statoPagamento: FatturaStatoPagamento;
  /** Solo ricevute. Default saldo. */
  naturaDocumento?: FatturaNaturaDocumento | null;
  statoIncassoNc?: FatturaStatoIncassoNc | null;
  rimborsoNecessario?: boolean | null;
  rimborsoMezzo?: FatturaRimborsoMezzo | null;
  fatturaCompensativaId?: string | null;
  modalitaCollegamento?: FatturaModalitaCollegamentoNc | null;
  fatturaSostitutivaId?: string | null;
  /** Dilazioni della fattura collegata da annullare (solo NC). */
  dilazioniAnnullateIds?: string[];
  /** Dopo create fattura: collega questa NC come compensata. */
  collegaComeCompensativaNcId?: string | null;
  note?: string;
  fatturaCollegataId?: string | null;
  riferimentoFatturaEsterno?: string;
  righe: FatturaRiga[];
  dilazioni?: FatturaDilazione[];
};

export type FatturaCollegabileOption = {
  id: string;
  numeroInterno: string;
  dataEmissione: string;
  totale: number;
  label: string;
};

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function clampSconto(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

/** Prezzo unitario dopo sconto %. */
export function prezzoScontatoUnitario(
  prezzoUnitario: number,
  scontoPercentuale: number
): number {
  const sconto = clampSconto(scontoPercentuale);
  return roundMoney(prezzoUnitario * (1 - sconto / 100));
}

export function importoRiga(
  quantita: number,
  prezzoUnitario: number,
  scontoPercentuale = 0
): number {
  return roundMoney(
    quantita * prezzoScontatoUnitario(prezzoUnitario, scontoPercentuale)
  );
}

export function calcolaTotaliFattura(input: {
  righe: Array<{
    quantita: number;
    prezzoUnitario: number;
    scontoPercentuale?: number;
    /** Se presente su almeno una riga, l’imposta è calcolata per riga. */
    ivaPercentuale?: number;
  }>;
  spedizione: number;
  spedizioneIvaApplicata?: boolean;
  /** Default true. Se false (NC) il trasporto non entra nei totali/incassi. */
  spedizioneSottraiIncassi?: boolean;
  /** Nota di credito: quantità negative → totali negativi; spedizione in valore assoluto. */
  notaCredito?: boolean;
  /** Fallback IVA documento / spedizione / righe senza aliquota. */
  ivaPercentuale: number;
  /** Forza calcolo IVA per riga (fatture ricevute). */
  ivaPerRiga?: boolean;
}): {
  imponibile: number;
  baseIva: number;
  imposta: number;
  totale: number;
  /** Aliquota prevalente (per persistenza header). */
  ivaPercentualePrevalente: number;
} {
  const fallbackIva = Number(input.ivaPercentuale) || 0;
  const usePerRiga =
    Boolean(input.ivaPerRiga) ||
    input.righe.some((r) => r.ivaPercentuale != null && Number.isFinite(r.ivaPercentuale));

  let prodotti = 0;
  let impostaRighe = 0;
  const weightByRate = new Map<number, number>();

  for (const r of input.righe) {
    const imp = importoRiga(
      r.quantita,
      r.prezzoUnitario,
      r.scontoPercentuale ?? 0
    );
    prodotti += imp;
    const rate = usePerRiga
      ? Number(r.ivaPercentuale ?? fallbackIva) || 0
      : fallbackIva;
    if (usePerRiga) {
      impostaRighe += (imp * rate) / 100;
    }
    const absImp = Math.abs(imp);
    if (absImp > 0) {
      weightByRate.set(rate, (weightByRate.get(rate) ?? 0) + absImp);
    }
  }
  prodotti = roundMoney(prodotti);

  const spedAbs = Math.abs(Number(input.spedizione) || 0);
  const includeSped =
    spedAbs > 0 && input.spedizioneSottraiIncassi !== false;
  const spedizione = !includeSped
    ? 0
    : input.notaCredito
      ? -spedAbs
      : spedAbs;
  const imponibile = roundMoney(prodotti + spedizione);
  const baseIva = roundMoney(
    prodotti + (input.spedizioneIvaApplicata ? spedizione : 0)
  );

  let imposta: number;
  if (usePerRiga) {
    const spedIva =
      input.spedizioneIvaApplicata && spedizione !== 0
        ? (spedizione * fallbackIva) / 100
        : 0;
    imposta = roundMoney(impostaRighe + spedIva);
  } else {
    imposta = roundMoney((baseIva * fallbackIva) / 100);
  }

  let ivaPercentualePrevalente = fallbackIva;
  let bestW = -1;
  for (const [rate, w] of weightByRate) {
    if (w > bestW) {
      bestW = w;
      ivaPercentualePrevalente = rate;
    }
  }

  return {
    imponibile,
    baseIva,
    imposta,
    totale: roundMoney(imponibile + imposta),
    ivaPercentualePrevalente,
  };
}

/**
 * Quantità negativa per storno riga o nota di credito.
 * Il prezzo unitario resta sempre positivo; il segno è sulla quantità.
 */
export function normalizeQuantitaNegativa(quantita: number): number {
  if (!Number.isFinite(quantita) || quantita === 0) return -1;
  return quantita > 0 ? -quantita : quantita;
}

/** Allinea quantità NC: sempre negative (prezzo unitario resta positivo). */
export function normalizeQuantitaNotaCredito(quantita: number): number {
  return normalizeQuantitaNegativa(quantita);
}

export function isRigaStornoQuantita(quantita: number): boolean {
  return Number.isFinite(quantita) && quantita < 0;
}

/** Quantità positiva in fattura (toglie lo storno). */
export function normalizeQuantitaPositiva(quantita: number): number {
  if (!Number.isFinite(quantita) || quantita === 0) return 1;
  return Math.abs(quantita);
}

export function statoPagamentoFromIncassoNc(
  stato: FatturaStatoIncassoNc
): Extract<FatturaStatoPagamento, "pagato" | "da_pagare"> {
  return stato === "gia_incassata" ? "pagato" : "da_pagare";
}

export function labelStatoIncassoNc(stato: FatturaStatoIncassoNc): string {
  return stato === "gia_incassata" ? "Già incassata" : "Non incassata";
}

export function labelRimborsoMezzo(mezzo: FatturaRimborsoMezzo): string {
  if (mezzo === "denaro") return "Denaro";
  if (mezzo === "rimpiazzo_merce") return "Rimpiazzo merce";
  return "Nuova fattura";
}

export function year2FromDate(isoDate: string): string {
  const y = isoDate?.slice(0, 4);
  if (y && /^\d{4}$/.test(y)) return y.slice(2);
  return String(new Date().getFullYear()).slice(-2);
}

/** Data odierna YYYY-MM-DD (locale). */
export function todayIsoDate(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Scadenza futura rispetto a oggi → non ancora saldabile come “pagata” forzata. */
export function isDilazioneFutura(
  dataScadenza: string,
  today = todayIsoDate()
): boolean {
  return dataScadenza > today;
}

/** Rate future: stato sempre da_pagare. */
export function normalizeDilazioneStato(
  dataScadenza: string,
  stato: FatturaStatoPagamento,
  today = todayIsoDate()
): FatturaStatoPagamento {
  if (isDilazioneFutura(dataScadenza, today)) return "da_pagare";
  return stato;
}

/** Se ci sono dilazioni: pagato solo se tutte pagate. */
export function statoPagamentoFromDilazioni(
  dilazioni: Array<{ statoPagamento: FatturaStatoPagamento | string }>
): Extract<FatturaStatoPagamento, "pagato" | "da_pagare"> {
  if (dilazioni.length === 0) return "da_pagare";
  return dilazioni.every((d) => d.statoPagamento === "pagato")
    ? "pagato"
    : "da_pagare";
}

export function emptyFatturaDilazione(
  totaleSuggerito = 0
): FatturaDilazione {
  return {
    dataScadenza: todayIsoDate(),
    importo: Math.max(0, roundMoney(totaleSuggerito)),
    statoPagamento: "da_pagare",
    note: "",
  };
}

export type DilazioniBilancio = {
  sommaDilazioni: number;
  totaleFattura: number;
  differenza: number;
  /** somma < totale (manca da dilazionare) */
  mancante: number;
  /** somma > totale */
  esubero: number;
  equilibrato: boolean;
};

/** Confronto somma rate vs totale fattura (tolleranza 1 cent). */
export function bilancioDilazioni(
  totaleFattura: number,
  importiDilazioni: number[]
): DilazioniBilancio {
  const totale = roundMoney(totaleFattura);
  const somma = roundMoney(
    importiDilazioni.reduce((s, n) => s + (Number(n) || 0), 0)
  );
  const differenza = roundMoney(somma - totale);
  const equilibrato = Math.abs(differenza) < 0.005;
  return {
    sommaDilazioni: somma,
    totaleFattura: totale,
    differenza,
    mancante: equilibrato || differenza >= 0 ? 0 : roundMoney(-differenza),
    esubero: equilibrato || differenza <= 0 ? 0 : differenza,
    equilibrato,
  };
}

/** Ft-26-C001/1 — oppure Nc-26-C001/1 per note di credito. */
export function buildNumeroInternoFattura(input: {
  dataEmissione: string;
  codiceTarga: string;
  seq: number;
  kind?: FatturaKind;
}): string {
  const aa = year2FromDate(input.dataEmissione);
  const targa = input.codiceTarga.trim().toUpperCase() || "X000";
  const seq = Math.max(1, Math.floor(input.seq));
  const prefix = input.kind === "nota_credito" ? "Nc" : "Ft";
  return `${prefix}-${aa}-${targa}/${seq}`;
}

const rigaSchemaBase = z.object({
  id: z.string().optional(),
  prodottoId: z.string().uuid().nullable().optional(),
  codice: z.string().trim().min(1, "Codice prodotto obbligatorio"),
  descrizione: z.string().trim().min(1, "Descrizione obbligatoria"),
  quantita: z.number().refine((n) => n !== 0, "Quantità non valida"),
  unitaMisura: z.string().trim().max(16).optional(),
  prezzoUnitario: z.number().min(0, "Prezzo non valido"),
  scontoPercentuale: z.number().min(0).max(100).optional(),
  ivaPercentuale: z.number().min(0).max(100).optional(),
  importo: z.number().optional(),
  isBeneAmmortizzabile: z.boolean().optional(),
});

const dilazioneSchema = z.object({
  id: z.string().optional(),
  dataScadenza: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data dilazione non valida"),
  importo: z.number().min(0, "Importo dilazione non valido"),
  statoPagamento: z.enum(["pagato", "da_pagare"]),
  note: z.string().optional(),
});

const fatturaInputObjectSchema = z.object({
  anagraficaId: z.string().uuid("Anagrafica non valida"),
  anagraficaRagioneSociale: z.string().trim().min(1),
  anagraficaCodiceTarga: z.string().trim().min(1),
  dataEmissione: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data non valida"),
  numeroDocumentoEsterno: z.string().optional(),
  ficId: z.number().int().positive().nullable().optional(),
  spedizione: z.number().min(0),
  spedizioneIvaApplicata: z.boolean().optional(),
  spedizioneSottraiIncassi: z.boolean().optional(),
  ivaPercentuale: z.number().min(0).max(100),
  statoPagamento: z.enum(["pagato", "da_pagare"]),
  naturaDocumento: z.enum(["acconto", "saldo"]).nullable().optional(),
  statoIncassoNc: z.enum(["gia_incassata", "non_incassata"]).nullable().optional(),
  rimborsoNecessario: z.boolean().nullable().optional(),
  rimborsoMezzo: z
    .enum(["denaro", "rimpiazzo_merce", "nuova_fattura"])
    .nullable()
    .optional(),
  fatturaCompensativaId: z.string().uuid().nullable().optional(),
  modalitaCollegamento: z.enum(["normale", "sostituzione"]).nullable().optional(),
  fatturaSostitutivaId: z.string().uuid().nullable().optional(),
  dilazioniAnnullateIds: z.array(z.string().uuid()).optional(),
  collegaComeCompensativaNcId: z.string().uuid().nullable().optional(),
  note: z.string().optional(),
  fatturaCollegataId: z.string().uuid().nullable().optional(),
  riferimentoFatturaEsterno: z.string().optional(),
  righe: z.array(rigaSchemaBase).min(1, "Aggiungi almeno un prodotto"),
  dilazioni: z.array(dilazioneSchema).optional(),
});

function transformFatturaInput(
  v: z.infer<typeof fatturaInputObjectSchema>,
  kind: FatturaKind
) {
  const today = todayIsoDate();
  const isNc = kind === "nota_credito";
  const isRicevuta = kind === "ricevuta";
  const righe = v.righe.map((r) => {
    const scontoPercentuale = clampSconto(r.scontoPercentuale ?? 0);
    const quantita = isNc
      ? normalizeQuantitaNotaCredito(r.quantita)
      : r.quantita;
    // Fattura: qty > 0 normale, qty < 0 storno/annullamento voce. NC: sempre < 0.
    if (!Number.isFinite(quantita) || quantita === 0) {
      throw new Error(
        "Quantità non valida: usa un valore diverso da zero (negativo = storno)."
      );
    }
    const ivaRiga =
      r.ivaPercentuale != null && Number.isFinite(r.ivaPercentuale)
        ? Math.min(100, Math.max(0, r.ivaPercentuale))
        : isRicevuta
          ? Math.min(100, Math.max(0, Number(v.ivaPercentuale) || 22))
          : undefined;
    return {
      id: r.id,
      prodottoId: r.prodottoId ?? null,
      codice: r.codice.trim(),
      descrizione: r.descrizione.trim(),
      quantita,
      unitaMisura: (r.unitaMisura ?? "NR").trim() || "NR",
      prezzoUnitario: Math.abs(r.prezzoUnitario),
      scontoPercentuale,
      ivaPercentuale: ivaRiga,
      importo: importoRiga(quantita, Math.abs(r.prezzoUnitario), scontoPercentuale),
      isBeneAmmortizzabile:
        !isNc &&
        canFlagBeneAmmortizzabile(Math.abs(r.prezzoUnitario)) &&
        Boolean(r.isBeneAmmortizzabile),
    };
  });
  const dilazioni = isNc
    ? []
    : (v.dilazioni ?? []).map((d) => ({
        id: d.id,
        dataScadenza: d.dataScadenza,
        importo: roundMoney(d.importo),
        statoPagamento: normalizeDilazioneStato(
          d.dataScadenza,
          d.statoPagamento,
          today
        ),
        note: (d.note ?? "").trim(),
      }));

  let statoIncassoNc: FatturaStatoIncassoNc | null = null;
  let rimborsoNecessario: boolean | null = null;
  let rimborsoMezzo: FatturaRimborsoMezzo | null = null;
  let fatturaCompensativaId: string | null = null;
  let modalitaCollegamento: FatturaModalitaCollegamentoNc | null = null;
  let fatturaSostitutivaId: string | null = null;
  let statoPagamento = v.statoPagamento;
  let dilazioniAnnullateIds: string[] = [];

  if (isNc) {
    modalitaCollegamento = v.modalitaCollegamento ?? "normale";
    if (modalitaCollegamento === "sostituzione") {
      fatturaSostitutivaId = v.fatturaSostitutivaId ?? null;
      if (!fatturaSostitutivaId) {
        throw new Error("Seleziona la fattura sostitutiva (rimpiazzo gestionale).");
      }
      if (
        v.fatturaCollegataId &&
        fatturaSostitutivaId === v.fatturaCollegataId
      ) {
        throw new Error(
          "La fattura sostitutiva deve essere diversa da quella stornata."
        );
      }
      // Interno: niente rimborso/incasso/dilazioni — NC azzera e rimpiazza
      statoIncassoNc = null;
      statoPagamento = "pagato";
      rimborsoNecessario = null;
      rimborsoMezzo = null;
      fatturaCompensativaId = null;
      dilazioniAnnullateIds = [];
    } else {
      statoIncassoNc = v.statoIncassoNc ?? "non_incassata";
      statoPagamento = statoPagamentoFromIncassoNc(statoIncassoNc);
      dilazioniAnnullateIds = [...new Set(v.dilazioniAnnullateIds ?? [])];
      if (statoIncassoNc === "gia_incassata") {
        rimborsoNecessario = Boolean(v.rimborsoNecessario);
        if (rimborsoNecessario) {
          rimborsoMezzo = v.rimborsoMezzo ?? null;
          if (!rimborsoMezzo) {
            throw new Error("Seleziona il mezzo di rimborso.");
          }
          if (rimborsoMezzo === "nuova_fattura") {
            fatturaCompensativaId = v.fatturaCompensativaId ?? null;
          }
        }
      }
    }
  } else if (dilazioni.length > 0) {
    statoPagamento = statoPagamentoFromDilazioni(dilazioni);
  }

  const naturaDocumento: FatturaNaturaDocumento | null =
    kind === "ricevuta"
      ? v.naturaDocumento === "acconto"
        ? "acconto"
        : "saldo"
      : null;

  const totalsPreview = calcolaTotaliFattura({
    righe,
    spedizione: Math.abs(Number(v.spedizione) || 0),
    spedizioneIvaApplicata: Boolean(v.spedizioneIvaApplicata),
    spedizioneSottraiIncassi: isNc ? v.spedizioneSottraiIncassi !== false : true,
    notaCredito: isNc,
    ivaPercentuale: Number(v.ivaPercentuale) || 22,
    ivaPerRiga: isRicevuta,
  });

  return {
    ...v,
    anagraficaRagioneSociale: v.anagraficaRagioneSociale.trim(),
    anagraficaCodiceTarga: v.anagraficaCodiceTarga.trim().toUpperCase(),
    numeroDocumentoEsterno: (v.numeroDocumentoEsterno ?? "").trim(),
    note: (v.note ?? "").trim(),
    fatturaCollegataId: v.fatturaCollegataId ?? null,
    riferimentoFatturaEsterno: (v.riferimentoFatturaEsterno ?? "").trim(),
    ficId: v.ficId ?? null,
    spedizione: Math.abs(Number(v.spedizione) || 0),
    spedizioneIvaApplicata: Boolean(v.spedizioneIvaApplicata),
    spedizioneSottraiIncassi: isNc
      ? v.spedizioneSottraiIncassi !== false
      : true,
    statoPagamento,
    naturaDocumento,
    ivaPercentuale: isRicevuta
      ? totalsPreview.ivaPercentualePrevalente
      : Number(v.ivaPercentuale) || 0,
    statoIncassoNc,
    rimborsoNecessario,
    rimborsoMezzo,
    fatturaCompensativaId,
    modalitaCollegamento,
    fatturaSostitutivaId,
    dilazioniAnnullateIds,
    collegaComeCompensativaNcId: v.collegaComeCompensativaNcId ?? null,
    righe,
    dilazioni,
  };
}

/** Schema legacy (fattura/ricevuta). Per NC usare parseFatturaInput. */
export const fatturaInputSchema = fatturaInputObjectSchema.transform((v) =>
  transformFatturaInput(v, "emessa")
);

export function parseFatturaInput(kind: FatturaKind, payload: unknown) {
  const parsed = fatturaInputObjectSchema.safeParse(payload);
  if (!parsed.success) {
    return {
      success: false as const,
      error: parsed.error.issues[0]?.message ?? "Validazione fallita.",
    };
  }
  try {
    return {
      success: true as const,
      data: transformFatturaInput(parsed.data, kind),
    };
  } catch (e) {
    return {
      success: false as const,
      error: e instanceof Error ? e.message : "Validazione fallita.",
    };
  }
}

function mapRighe(
  righe: Array<FatturaEmessaRigaRow | FatturaRicevutaRigaRow>
): FatturaRiga[] {
  return [...righe]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((r) => {
      const ricevuta = r as FatturaRicevutaRigaRow;
      return {
        id: r.id,
        prodottoId: r.prodotto_id,
        codice: r.codice,
        descrizione: r.descrizione,
        quantita: Number(r.quantita) || 0,
        unitaMisura:
          "unita_misura" in ricevuta
            ? String(ricevuta.unita_misura || "NR")
            : "NR",
        prezzoUnitario: Number(r.prezzo_unitario) || 0,
        scontoPercentuale: Number(r.sconto_percentuale) || 0,
        ivaPercentuale:
          "iva_percentuale" in ricevuta
            ? Number(ricevuta.iva_percentuale) || 22
            : undefined,
        importo: Number(r.importo) || 0,
        isBeneAmmortizzabile: Boolean(r.is_bene_ammortizzabile),
      };
    });
}

function mapDilazioni(
  dilazioni: Array<FatturaEmessaDilazioneRow | FatturaRicevutaDilazioneRow>
): FatturaDilazione[] {
  return [...dilazioni]
    .filter((d) => !d.deleted_at)
    .sort((a, b) => {
      if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
      return a.data_scadenza.localeCompare(b.data_scadenza);
    })
    .filter((d) => d.stato_pagamento !== "annullata")
    .map((d) => ({
      id: d.id,
      dataScadenza: d.data_scadenza,
      importo: Number(d.importo) || 0,
      statoPagamento: d.stato_pagamento as FatturaStatoPagamento,
      note: d.note ?? "",
    }));
}

export function mapFatturaEmessaRow(
  row: FatturaEmessaRow,
  righe: FatturaEmessaRigaRow[],
  dilazioni: FatturaEmessaDilazioneRow[] = []
): Fattura {
  const isNc =
    row.tipo_documento === "nota_credito" ||
    String(row.numero_interno ?? "").toUpperCase().startsWith("NC-");
  return {
    id: row.id,
    kind: isNc ? "nota_credito" : "emessa",
    numeroInterno: row.numero_interno,
    anagraficaId: row.cliente_id,
    anagraficaRagioneSociale: row.cliente_ragione_sociale,
    anagraficaCodiceTarga: row.cliente_codice_targa,
    dataEmissione: row.data_emissione,
    numeroDocumentoEsterno: row.numero_documento_esterno ?? "",
    ficId: row.fic_id,
    spedizione: Number(row.spedizione) || 0,
    spedizioneIvaApplicata: Boolean(row.spedizione_iva_applicata),
    spedizioneSottraiIncassi: row.spedizione_sottrai_incassi !== false,
    imponibile: Number(row.imponibile) || 0,
    ivaPercentuale: Number(row.iva_percentuale) || 0,
    imposta: Number(row.imposta) || 0,
    totale: Number(row.totale) || 0,
    statoPagamento: row.stato_pagamento,
    naturaDocumento: null,
    statoIncassoNc: row.stato_incasso_nc ?? null,
    rimborsoNecessario: row.rimborso_necessario ?? null,
    rimborsoMezzo: row.rimborso_mezzo ?? null,
    fatturaCompensativaId: row.fattura_compensativa_id ?? null,
    modalitaCollegamento: row.modalita_collegamento ?? null,
    fatturaSostitutivaId: row.fattura_sostitutiva_id ?? null,
    annullataDaNcId: row.annullata_da_nc_id ?? null,
    annullataDaNcNumeroInterno: null,
    ricevuta: row.ricevuta_storage_path
      ? {
          storagePath: row.ricevuta_storage_path,
          fileName: row.ricevuta_file_name || "ricevuta",
        }
      : null,
    versione: row.versione,
    documentoStato: row.documento_stato,
    note: row.note ?? "",
    fatturaCollegataId: row.fattura_collegata_id ?? null,
    riferimentoFatturaEsterno: row.riferimento_fattura_esterno ?? "",
    righe: mapRighe(righe),
    dilazioni: mapDilazioni(dilazioni),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapFatturaRicevutaRow(
  row: FatturaRicevutaRow,
  righe: FatturaRicevutaRigaRow[],
  dilazioni: FatturaRicevutaDilazioneRow[] = []
): Fattura {
  return {
    id: row.id,
    kind: "ricevuta",
    numeroInterno: row.numero_interno,
    anagraficaId: row.fornitore_id,
    anagraficaRagioneSociale: row.fornitore_ragione_sociale,
    anagraficaCodiceTarga: row.fornitore_codice_targa,
    dataEmissione: row.data_emissione,
    numeroDocumentoEsterno: row.numero_documento_esterno ?? "",
    ficId: row.fic_id,
    spedizione: Number(row.spedizione) || 0,
    spedizioneIvaApplicata: Boolean(row.spedizione_iva_applicata),
    spedizioneSottraiIncassi: true,
    imponibile: Number(row.imponibile) || 0,
    ivaPercentuale: Number(row.iva_percentuale) || 0,
    imposta: Number(row.imposta) || 0,
    totale: Number(row.totale) || 0,
    statoPagamento: row.stato_pagamento,
    naturaDocumento:
      row.natura_documento === "acconto" ? "acconto" : "saldo",
    statoIncassoNc: null,
    rimborsoNecessario: null,
    rimborsoMezzo: null,
    fatturaCompensativaId: null,
    modalitaCollegamento: null,
    fatturaSostitutivaId: null,
    ricevuta: row.ricevuta_storage_path
      ? {
          storagePath: row.ricevuta_storage_path,
          fileName: row.ricevuta_file_name || "ricevuta",
        }
      : null,
    versione: row.versione,
    documentoStato: row.documento_stato,
    note: row.note ?? "",
    fatturaCollegataId: null,
    riferimentoFatturaEsterno: "",
    righe: mapRighe(righe),
    dilazioni: mapDilazioni(dilazioni),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function labelModalitaCollegamentoNc(
  m: FatturaModalitaCollegamentoNc | null | undefined
): string {
  return m === "sostituzione" ? "Sostituzione gestionale" : "Normale";
}

export function labelStatoPagamento(
  stato: FatturaStatoPagamento,
  kind?: FatturaKind,
  opts?: { annullataDaNcNumeroInterno?: string | null }
): string {
  if (kind === "nota_credito") {
    return stato === "pagato" ? "Già incassata" : "Non incassata";
  }
  if (stato === "annullata") {
    const nc = opts?.annullataDaNcNumeroInterno?.trim();
    return nc ? `Annullata (${nc})` : "Annullata";
  }
  return stato === "pagato" ? "Pagato" : "Da pagare";
}

export function labelNaturaDocumento(
  natura: FatturaNaturaDocumento | null | undefined
): string {
  return natura === "acconto" ? "Acconto" : "Saldo";
}

/**
 * Documenti da escludere da incassi / IVA / utili:
 * - fattura con stato annullata (stornata da NC)
 * - nota di credito di storno collegata a una fattura (evita doppio storno)
 */
export function includeInContabilitaFatturaEmessa(row: {
  tipo_documento?: string | null;
  stato_pagamento?: string | null;
  fattura_collegata_id?: string | null;
}): boolean {
  if (row.stato_pagamento === "annullata") return false;
  const isNc = row.tipo_documento === "nota_credito";
  if (isNc && row.fattura_collegata_id) return false;
  return true;
}

export function emptyFatturaRigaNotaCredito(): FatturaRiga {
  return {
    prodottoId: null,
    codice: "",
    descrizione: "",
    quantita: -1,
    unitaMisura: "NR",
    prezzoUnitario: 0,
    scontoPercentuale: 0,
    ivaPercentuale: 22,
    importo: 0,
    isBeneAmmortizzabile: false,
  };
}

/** Riga di storno in fattura (qty negativa, prezzo positivo). */
export function emptyFatturaRigaStorno(): FatturaRiga {
  return {
    prodottoId: null,
    codice: "",
    descrizione: "Storno / annullamento",
    quantita: -1,
    unitaMisura: "NR",
    prezzoUnitario: 0,
    scontoPercentuale: 0,
    ivaPercentuale: 22,
    importo: 0,
    isBeneAmmortizzabile: false,
  };
}

export function formatEuro(value: number): string {
  return value.toLocaleString("it-IT", {
    style: "currency",
    currency: "EUR",
  });
}

export function formatDateIt(isoDate: string | null | undefined): string {
  if (!isoDate) return "—";
  try {
    return new Date(isoDate).toLocaleDateString("it-IT");
  } catch {
    return isoDate;
  }
}

export function emptyFatturaRiga(): FatturaRiga {
  return {
    prodottoId: null,
    codice: "",
    descrizione: "",
    quantita: 1,
    unitaMisura: "NR",
    prezzoUnitario: 0,
    scontoPercentuale: 0,
    ivaPercentuale: 22,
    importo: 0,
    isBeneAmmortizzabile: false,
  };
}
