import { z } from "zod";
import { ORDINE_TIPI_PAGAMENTO, type OrdineTipoPagamento } from "@/lib/amministrazione/ordini";
import {
  formatNumeroPreventivoDocumento,
  yearFromPreventivoData,
} from "@/lib/amministrazione/preventivo-letterhead";

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
  "ritiro",
  "corriere_nostro",
  "corriere_cliente",
] as const;

export type PreventivoConsegna = (typeof PREVENTIVO_CONSEGNA)[number];

export const PREVENTIVO_CONSEGNA_LABEL: Record<PreventivoConsegna, string> = {
  ritiro: "Ritiro in sede",
  corriere_nostro: "Corriere a nostro carico",
  corriere_cliente: "Corriere a carico cliente",
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
  confezionamento: string;
};

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
  tipoPagamento: OrdineTipoPagamento;
  tempiPagamentoGiorni: number | null;
  tempiPagamentoNote: string;
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
  confezionamento: z.string().trim().max(400).optional().default(""),
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
    tipoPagamento: z.enum([
      "anticipato",
      "alla_consegna",
      "posticipato",
      "dilazionato",
    ]),
    tempiPagamentoGiorni: z.number().int().min(0).nullable().optional(),
    tempiPagamentoNote: z.string().trim().max(500).optional().default(""),
    note: z.string().trim().max(4000).optional().default(""),
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

export { ORDINE_TIPI_PAGAMENTO };
