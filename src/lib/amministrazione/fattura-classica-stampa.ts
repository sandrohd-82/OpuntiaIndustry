import type {
  FatturaA4Riga,
  FatturaDestinatarioSnapshot,
} from "@/lib/amministrazione/fattura-a4-documento";
import type { OrdinePagamentoPiano } from "@/lib/amministrazione/ordine-pagamento-piano";
import type { PreventivoCommercialeRiferimento } from "@/lib/amministrazione/preventivo-commerciale-riferimento";

/** Fattura emessa da stampare con lo stesso foglio della fattura classica. */
export type FatturaClassicaStampaModel = {
  numero: string;
  dataDocumento: string;
  commerciale: PreventivoCommercialeRiferimento | null;
  destinatario: FatturaDestinatarioSnapshot;
  righe: FatturaA4Riga[];
  note: string;
  piano: OrdinePagamentoPiano;
  ivaPercentuale: number;
  imponibile: number;
  imposta: number;
  totale: number;
};
