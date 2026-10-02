import type { FatturaA4Riga } from "@/lib/amministrazione/fattura-a4-documento";

/** Intestazione letta dall'XML SDI, non dall'anagrafica interna. */
export type FatturaClassicaSoggetto = {
  ragioneSociale: string;
  via: string;
  capCitta: string;
  partitaIva: string;
  codiceFiscale: string;
  email: string;
  telefono: string;
  sdi: string;
  /** Codice o nome letto dallo SDI (Nazione / IdPaese). */
  nazione: string;
};

export type FatturaClassicaScadenza = {
  data: string;
  importo: number;
};

/** Grafica della fattura di sistema, dati presi dallo SDI. */
export type FatturaClassicaStampaModel = {
  numero: string;
  dataDocumento: string;
  emittente: FatturaClassicaSoggetto;
  destinatario: FatturaClassicaSoggetto;
  righe: FatturaA4Riga[];
  note: string;
  pagamento: string;
  scadenze: FatturaClassicaScadenza[];
  banca: string;
  iban: string;
  bic: string;
  aliquote: { aliquota: number; imponibile: number; imposta: number }[];
  ivaPercentuale: number;
  imponibile: number;
  imposta: number;
  totale: number;
  /** Nazione della controparte, solo se non è l'Italia. */
  nazioneEstera: string | null;
};
