import type {
  FatturaA4Riga,
  FatturaDestinatarioSnapshot,
} from "@/lib/amministrazione/fattura-a4-documento";

export type FatturaInvioMailDraft = {
  fatturaId?: string | null;
  to: string;
  numeroFattura: string;
  dataDocumento: string;
  clienteNome: string;
  destinatario: FatturaDestinatarioSnapshot;
  righe: FatturaA4Riga[];
  noteDocumento: string;
  ordineNumero: string;
};
