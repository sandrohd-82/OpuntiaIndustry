import { z } from "zod";
import { ORDINE_TIPI_PAGAMENTO, type OrdineTipoPagamento } from "@/lib/amministrazione/ordini";

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

export const createPreventivoSchema = z.object({
  clienteId: z.string().uuid("Seleziona un’azienda"),
  cliente: z.string().trim().min(1),
  codiceTargaCliente: z.string().trim().min(1),
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
});

export function formatNumeroPreventivo(
  data: string,
  targa: string,
  seq: number
): string {
  const yy = data.slice(2, 4) || String(new Date().getFullYear()).slice(2);
  const code = targa.trim().toUpperCase().replace(/\s+/g, "");
  return `Pv-${yy}-${code}/${seq}`;
}

export { ORDINE_TIPI_PAGAMENTO };
