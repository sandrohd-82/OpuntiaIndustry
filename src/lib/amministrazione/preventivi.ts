import { z } from "zod";
import { ORDINE_TIPI_PAGAMENTO, type OrdineTipoPagamento } from "@/lib/amministrazione/ordini";
import type { PreventivoCommercialeRiferimento } from "@/lib/amministrazione/preventivo-commerciale-riferimento";
import {
  formatNumeroPreventivoDocumento,
  yearFromPreventivoData,
  type DestinatarioPreventivo,
} from "@/lib/amministrazione/preventivo-letterhead";
import {
  PREVENTIVO_SPEDIZIONE_FONTI,
  SPEDIZIONE_MARKUP_SICUREZZA_PCT,
  type PreventivoSpedizioneFonte,
} from "@/lib/amministrazione/preventivo-spedizione";

export { SPEDIZIONE_MARKUP_SICUREZZA_PCT };
export type { PreventivoSpedizioneFonte };

/** Giorni in raccolta operativa, poi la stessa raccolta in Archivio. */
export const PREVENTIVI_RACCOLTA_GIORNI = 30;

/** Il lock di inserimento spedizione si libera da solo dopo questo tempo. */
export const PREVENTIVI_LOCK_MS = 15 * 60 * 1000;

export const PREVENTIVO_RACCOLTE = [
  "da_completare",
  "inviati",
  "accettati",
] as const;
export type PreventivoRaccolta = (typeof PREVENTIVO_RACCOLTE)[number];

export const PREVENTIVO_RACCOLTA_LABEL: Record<PreventivoRaccolta, string> = {
  da_completare: "Da completare",
  inviati: "Inviati",
  accettati: "Accettati",
};

export function statiPreventivoRaccolta(
  raccolta: PreventivoRaccolta
): PreventivoStato[] {
  if (raccolta === "da_completare") return ["creato", "in_attesa_spedizione"];
  if (raccolta === "inviati") return ["inviato", "respinto"];
  return ["accettato"];
}

export function spedizioneLockAttivo(
  lockAt: string | null | undefined,
  now = Date.now()
): boolean {
  if (!lockAt) return false;
  const t = new Date(lockAt).getTime();
  return Number.isFinite(t) && now - t < PREVENTIVI_LOCK_MS;
}

export const PREVENTIVO_STATI = [
  "creato",
  "in_attesa_spedizione",
  "inviato",
  "accettato",
  "respinto",
] as const;

export type PreventivoStato = (typeof PREVENTIVO_STATI)[number];

export const PREVENTIVO_STATO_LABEL: Record<PreventivoStato, string> = {
  creato: "Creato (non inviato)",
  in_attesa_spedizione: "In attesa spedizione",
  inviato: "Inviato",
  accettato: "Accettato",
  respinto: "Respinto",
};

export const PREVENTIVO_CONSEGNA = [
  "da_concordare",
  "corriere_cliente",
  "corriere_nostro",
  "ritiro",
] as const;

export type PreventivoConsegna = (typeof PREVENTIVO_CONSEGNA)[number];

export const PREVENTIVO_CONSEGNA_LABEL: Record<PreventivoConsegna, string> = {
  da_concordare: "Da concordare",
  corriere_cliente: "A carico dell'acquirente",
  corriere_nostro: "A carico Agrinsicilia",
  ritiro: "Ritiro in sede",
};

export const CONFEZIONE_STANDARD = "standard";

export const GIORNI_CONSEGNA_DEFAULT = "da concordare";

export const PREVENTIVO_IVA_DEFAULT = 22;

export const PREVENTIVO_VALIDITA_GIORNI = 15;

export const PREVENTIVO_NOTE_DEFAULT =
  "Tutti i prodotti provengono da coltivazioni Siciliane in Biologico .\nOpuntia Italia è un Marchio registrato concesso in uso ad Agrinsicilia Coop";

export function labelModalitaPagamentoPreventivo(
  tipo: OrdineTipoPagamento
): string {
  if (tipo === "anticipato") return "Pagamento anticipato";
  if (tipo === "alla_consegna") return "Pagamento alla consegna";
  if (tipo === "pronto_magazzino") return "Pagamento a pronto magazzino";
  if (tipo === "posticipato") return "Pagamento posticipato";
  return "Pagamento dilazionato";
}

export function roundEuro(n: number): number {
  return Math.round(n * 100) / 100;
}

export const PREVENTIVI_SPEDIZIONE_NAV_EVENT = "opuntia-preventivi-spedizione-nav";

export function notifyPreventiviSpedizioneNav() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(PREVENTIVI_SPEDIZIONE_NAV_EVENT));
}

export function nomeFilePreventivoPdf(numero: string): string {
  const safe = numero.trim().replace(/\//g, "-").replace(/[^\w.\-]+/g, "_") || "preventivo";
  return `${safe}.pdf`;
}

export type PreventivoScontisticaRiga = {
  id: string;
  qtyDa: number;
  qtyA: number | null;
  imballaggioVoceId: string;
  imballaggioLabel: string;
  scontoPct: number;
  kgConfezione: number;
  kgStandard: number | null;
  kgForzato: boolean;
  targa: string;
  imballaggioCodice?: string;
  imballaggioNome?: string;
  preview: string | null;
};

export type PreventivoConfezioneOption = {
  value: string;
  label: string;
  isStandard: boolean;
  imballaggioVoceId: string | null;
};

export type PreventivoRiga = {
  id: string;
  prodottoId: string;
  prodottoCodice: string;
  prodottoNome: string;
  quantita: number;
  unitaMisura: string;
  prezzoUnitario: number;
  ivaPercentuale: number;
  listinoId: string | null;
  prezzoDaListino: boolean;
  scontoExtraPct: number;
  /** Percentuale di listino della confezione. */
  scontoListinoStandardPct: number;
  /** Percentuale applicata: da 0 fino allo standard. */
  scontoListinoPct: number;
  scontoQuotaAziendaPct: number;
  scontoQuotaCommercialePct: number;
  scontoSuddivisioneAttiva: boolean;
  scontoSuddivisioneStato: "non_richiesta" | "in_attesa" | "approvata" | "rifiutata";
  confezionamento: string;
  imballaggioVoceId: string | null;
  accordoId?: string | null;
  accordoModalita?: "sconto_percentuale" | "prezzo_fisso" | null;
  accordoValoreOrigine?: number | null;
  accordoGiustificazione?: string;
  accordoForzato?: boolean;
};

export function prezzoNettoRigaPreventivo(
  prezzoListino: number,
  scontoExtraPct: number,
  scontoListinoPct = 0
): number {
  if (!Number.isFinite(prezzoListino) || prezzoListino < 0) return 0;
  const listino = Number.isFinite(scontoListinoPct)
    ? Math.min(100, Math.max(0, scontoListinoPct))
    : 0;
  const extra = Number.isFinite(scontoExtraPct)
    ? Math.min(100, Math.max(0, scontoExtraPct))
    : 0;
  const dopoListino = prezzoListino * (1 - listino / 100);
  return Math.round(dopoListino * (1 - extra / 100) * 100) / 100;
}

export type Preventivo = {
  id: string;
  numeroInterno: string;
  clienteId: string;
  cliente: string;
  clienteCodiceTarga: string;
  dataPreventivo: string;
  stato: PreventivoStato;
  documentoStato: "bozza" | "approvato" | "chiuso";
  versione: number;
  consegnaMetodo: PreventivoConsegna;
  spedizioneACarico: "cliente" | "agrinsicilia" | "diviso";
  spedizioneImporto: number;
  spedizioneImportoBase: number;
  spedizioneMarkupPct: number;
  spedizioneFonte: PreventivoSpedizioneFonte;
  tipoPagamento: OrdineTipoPagamento;
  tempiPagamentoGiorni: number | null;
  tempiPagamentoNote: string;
  giorniConsegna: string;
  validitaGiorni: number;
  includeCoordinateBancarie: boolean;
  coordinateBanca: string;
  coordinateIban: string;
  coordinateBic: string;
  commercialeRiferimentoId: string | null;
  commercialeRiferimentoNome: string;
  commercialeRiferimentoTelefono: string;
  commercialeRiferimentoEmail: string;
  note: string;
  webmailAccettazioneId: string | null;
  referenteAccettazioneId: string | null;
  referenteAccettazioneLabel: string;
  archiviatoAt: string | null;
  /** Lock attivo tenuto da un altro operatore. */
  spedizioneInCorso: boolean;
  accettazioneSeniorStato: "non_richiesta" | "in_attesa" | "accettata" | "rifiutata";
  accettazioneSeniorNota: string;
  accettazioneSeniorPuoRispondere: boolean;
  righe: PreventivoRiga[];
  createdAt: string;
};

/** Dati per riaprire la modale di creazione su un preventivo già in archivio. */
export type PreventivoModificaFoglio = {
  id: string;
  numeroInterno: string;
  stato: PreventivoStato;
  dataPreventivo: string;
  note: string;
  giorniConsegna: string;
  validitaGiorni: number;
  tipoPagamento: OrdineTipoPagamento;
  consegnaMetodo: PreventivoConsegna;
  spedizioneACarico: "cliente" | "agrinsicilia" | "diviso";
  spedizioneFonte: PreventivoSpedizioneFonte;
  prezzoAcquirenteModo: "inserito" | "richiesto";
  spedizioneBase: number | null;
  ivaDocumento: number;
  destinatario: DestinatarioPreventivo | null;
  commerciale: PreventivoCommercialeRiferimento | null;
  mailAccountId: string;
  mailMittente: string;
  mailTo: string;
  mailOggetto: string;
  mailTesto: string;
  righe: Array<{
    key: string;
    prodottoId: string;
    prodottoCodice: string;
    prodottoNome: string;
    quantita: number;
    unitaMisura: string;
    prezzoUnitario: number;
    ivaPercentuale: number;
    listinoId: string | null;
    prezzoDaListino: boolean;
    scontoExtraPct: number;
    scontoListinoPct: number;
    scontoListinoStandardPct: number;
    scontoSuddivisioneAttiva: boolean;
    scontoQuotaAziendaPct: number;
    scontoQuotaCommercialePct: number;
    confezioneValue: string;
    confezionamento: string;
    imballaggioVoceId: string | null;
    accordoId?: string | null;
    accordoModalita?: "sconto_percentuale" | "prezzo_fisso" | null;
    accordoValoreOrigine?: number | null;
    accordoGiustificazione?: string;
    accordoForzato?: boolean;
  }>;
};

export const preventivoRigaSchema = z.object({
  prodottoId: z.string().uuid("Seleziona un prodotto"),
  prodottoCodice: z.string().trim().min(1),
  prodottoNome: z.string().trim().min(1),
  quantita: z.number().positive("Quantità maggiore di zero"),
  unitaMisura: z.string().trim().min(1).optional().default("kg"),
  prezzoUnitario: z.number().min(0),
  ivaPercentuale: z.number().min(0).max(100).optional().default(22),
  listinoId: z.string().uuid().nullable().optional().default(null),
  prezzoDaListino: z.boolean().optional().default(false),
  scontoExtraPct: z.number().min(0).max(100).optional().default(0),
  scontoListinoStandardPct: z.number().min(0).max(100).optional().default(0),
  scontoListinoPct: z.number().min(0).max(100).optional().default(0),
  scontoSuddivisioneAttiva: z.boolean().optional().default(false),
  scontoQuotaAziendaPct: z.number().min(0).max(100).optional().default(0),
  scontoQuotaCommercialePct: z.number().min(0).max(100).optional().default(0),
  confezionamento: z.string().trim().max(400).optional().default(""),
  imballaggioVoceId: z.string().uuid().nullable().optional().default(null),
  accordoId: z.string().uuid().nullable().optional().default(null),
  accordoModalita: z
    .enum(["sconto_percentuale", "prezzo_fisso"])
    .nullable()
    .optional()
    .default(null),
  accordoValoreOrigine: z.number().nullable().optional().default(null),
  accordoGiustificazione: z.string().trim().max(500).optional().default(""),
  accordoForzato: z.boolean().optional().default(false),
}).superRefine((riga, ctx) => {
  if (riga.accordoModalita) return;
  const applicato = riga.scontoListinoPct ?? 0;
  const standard = riga.scontoListinoStandardPct ?? 0;
  if (applicato > standard) {
    ctx.addIssue({
      code: "custom",
      message:
        "Lo sconto standard si può solo ridurre. Un aumento va in Sconto extra listino.",
      path: ["scontoListinoPct"],
    });
  }
});

export const createPreventivoSchema = z
  .object({
    clienteId: z.string().uuid().nullable().optional(),
    clientePossibileId: z.string().uuid().nullable().optional(),
    cliente: z.string().trim().min(1, "Seleziona un destinatario"),
    codiceTargaCliente: z.string().trim().min(1).optional().default("PC"),
    dataPreventivo: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Data obbligatoria"),
    consegnaMetodo: z.enum(PREVENTIVO_CONSEGNA),
    spedizioneACarico: z.enum(["cliente", "agrinsicilia", "diviso"]),
    spedizioneImporto: z.number().min(0).optional().default(0),
    spedizioneImportoBase: z.number().min(0).optional().default(0),
    spedizioneMarkupPct: z
      .number()
      .min(0)
      .max(100)
      .optional()
      .default(SPEDIZIONE_MARKUP_SICUREZZA_PCT),
    spedizioneFonte: z.enum(PREVENTIVO_SPEDIZIONE_FONTI).optional(),
    tipoPagamento: z.enum([
      "anticipato",
      "alla_consegna",
      "posticipato",
      "dilazionato",
    ]),
    tempiPagamentoGiorni: z.number().int().min(0).nullable().optional(),
    tempiPagamentoNote: z.string().trim().max(500).optional().default(""),
    giorniConsegna: z
      .string()
      .trim()
      .min(1, "Indica i giorni di consegna")
      .max(80)
      .optional()
      .default("da concordare"),
    validitaGiorni: z
      .number()
      .int()
      .min(1, "Validità almeno 1 giorno")
      .max(365, "Validità massimo 365 giorni")
      .optional()
      .default(PREVENTIVO_VALIDITA_GIORNI),
    includeCoordinateBancarie: z.boolean().optional().default(false),
    coordinateBanca: z.string().trim().max(120).optional().default(""),
    coordinateIban: z.string().trim().max(40).optional().default(""),
    coordinateBic: z.string().trim().max(20).optional().default(""),
    commercialeRiferimentoId: z
      .string()
      .uuid("Seleziona il commerciale di riferimento"),
    id: z.string().uuid().optional(),
    intenzione: z
      .enum(["bozza", "salvato", "inviato"])
      .optional()
      .default("bozza"),
    note: z
      .string()
      .trim()
      .max(4000)
      .optional()
      .default(PREVENTIVO_NOTE_DEFAULT),
    righe: z.array(preventivoRigaSchema).min(1, "Aggiungi almeno un prodotto"),
    modalitaSpedizionePrezzo: z
      .enum(["non_applicabile", "inserito", "richiesto"])
      .optional()
      .default("non_applicabile"),
    mailAccountId: z.string().uuid().optional(),
    mailTo: z.string().trim().max(200).optional().default(""),
    mailOggetto: z.string().trim().max(300).optional().default(""),
    mailTesto: z.string().trim().max(8000).optional().default(""),
  })
  .refine((d) => Boolean(d.clienteId || d.clientePossibileId), {
    message: "Seleziona un destinatario.",
  })
  .refine(
    (d) =>
      d.modalitaSpedizionePrezzo !== "richiesto" ||
      (d.consegnaMetodo === "corriere_cliente" &&
        Boolean(d.mailAccountId) &&
        d.mailTo.includes("@") &&
        d.mailOggetto.length > 0 &&
        d.mailTesto.length > 0),
    { message: "Per richiedere il calcolo compila casella, destinatario, oggetto e testo della mail." }
  );

export const inviaPreventivoMailSchema = z
  .object({
    preventivoId: z.string().uuid(),
    mailAccountId: z.string().uuid(),
    mailTo: z.string().trim().min(3).max(200),
    mailOggetto: z.string().trim().min(1).max(300),
    mailTesto: z.string().trim().min(1).max(8000),
    pdfBase64: z.string().min(1),
  })
  .refine((d) => d.mailTo.includes("@"), {
    message: "Indirizzo destinatario non valido.",
  });

export function formatNumeroPreventivo(
  data: string,
  _targa: string,
  seq: number
): string {
  return formatNumeroPreventivoDocumento(seq, yearFromPreventivoData(data));
}

export const stimaSpedizioneSchema = z.object({
  consegnaMetodo: z.enum(PREVENTIVO_CONSEGNA),
  cap: z.string().optional().default(""),
  nazione: z.string().optional().default(""),
  provincia: z.string().optional().default(""),
  pesoKg: z.number().min(0).optional().default(0),
  importoBaseManuale: z.number().min(0).nullable().optional(),
});

export { ORDINE_TIPI_PAGAMENTO };
