import type {
  FatturaA4Riga,
  FatturaDestinatarioSnapshot,
} from "@/lib/amministrazione/fattura-a4-documento";

export type FatturaInvioMailDraft = {
  fatturaId?: string | null;
  /** Proforma: mail sì, invio SDI no. */
  kind?: "fattura" | "proforma";
  to: string;
  numeroFattura: string;
  dataDocumento: string;
  clienteNome: string;
  destinatario: FatturaDestinatarioSnapshot;
  righe: FatturaA4Riga[];
  noteDocumento: string;
  ordineNumero: string;
};
