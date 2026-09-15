import { z } from "zod";
import { ORDINE_TIPI_PAGAMENTO, type OrdineTipoPagamento } from "@/lib/amministrazione/ordini";
import {
  formatNumeroPreventivoDocumento,
  yearFromPreventivoData,
} from "@/lib/amministrazione/preventivo-letterhead";
import {
  PREVENTIVO_SPEDIZIONE_FONTI,
  SPEDIZIONE_MARKUP_SICUREZZA_PCT,
  type PreventivoSpedizioneFonte,
} from "@/lib/amministrazione/preventivo-spedizione";

export { SPEDIZIONE_MARKUP_SICUREZZA_PCT };
export type { PreventivoSpedizioneFonte };

export const PREVENTIVO_STATI = [
  "creato",
  "inviato",
  "accettato",
  "respinto",
] as const;

export type PreventivoStato = (typeof PREVENTIVO_STATI)[number];

export const PREVENTIVO_STATO_LABEL: Record<PreventivoStato, string> = {
  creato: "Creato (non inviato)",
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
  if (tipo === "posticipato") return "Pagamento posticipato";
  return "Pagamento dilazionato";
}

export function roundEuro(n: number): number {
  return Math.round(n * 100) / 100;
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
  confezionamento: string;
  imballaggioVoceId: string | null;
};

export function prezzoNettoRigaPreventivo(
  prezzoListino: number,
  scontoExtraPct: number
): number {
  if (!Number.isFinite(prezzoListino) || prezzoListino < 0) return 0;
  const extra = Number.isFinite(scontoExtraPct)
    ? Math.min(100, Math.max(0, scontoExtraPct))
    : 0;
  return Math.round(prezzoListino * (1 - extra / 100) * 100) / 100;
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
  includeCoordinateBancarie: boolean;
  coordinateBanca: string;
  coordinateIban: string;
  coordinateBic: string;
  note: string;
  webmailAccettazioneId: string | null;
  referenteAccettazioneId: string | null;
  referenteAccettazioneLabel: string;
  righe: PreventivoRiga[];
  createdAt: string;
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
  confezionamento: z.string().trim().max(400).optional().default(""),
  imballaggioVoceId: z.string().uuid().nullable().optional().default(null),
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
    includeCoordinateBancarie: z.boolean().optional().default(false),
    coordinateBanca: z.string().trim().max(120).optional().default(""),
    coordinateIban: z.string().trim().max(40).optional().default(""),
    coordinateBic: z.string().trim().max(20).optional().default(""),
    note: z
      .string()
      .trim()
      .max(4000)
      .optional()
      .default(PREVENTIVO_NOTE_DEFAULT),
    righe: z.array(preventivoRigaSchema).min(1, "Aggiungi almeno un prodotto"),
  })
  .refine((d) => Boolean(d.clienteId || d.clientePossibileId), {
    message: "Seleziona un destinatario.",
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
