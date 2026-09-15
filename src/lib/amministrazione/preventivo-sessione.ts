import type { DestinatarioPreventivo } from "@/lib/amministrazione/preventivo-letterhead";
import type { PreventivoCommercialeRiferimento } from "@/lib/amministrazione/preventivo-commerciale-riferimento";
import type { OrdineTipoPagamento } from "@/lib/amministrazione/ordini";
import type { PreventivoConsegna } from "@/lib/amministrazione/preventivi";
import type { PreventivoSpedizioneFonte } from "@/lib/amministrazione/preventivo-spedizione";

export const PREVENTIVO_SESSIONE_KEY = "opuntia.preventivo.sessione-provvisoria";

export type PreventivoIntenzione = "bozza" | "salvato" | "inviato";

export type PreventivoSessioneRiga = {
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
  confezioneValue: string;
  confezionamento: string;
  imballaggioVoceId: string | null;
  disponibilita: string | null;
  blocco: string | null;
};

export type PreventivoSessione = {
  savedId: string | null;
  numeroInterno: string;
  intenzione: PreventivoIntenzione;
  destinatario: DestinatarioPreventivo | null;
  commerciale: PreventivoCommercialeRiferimento | null;
  dataPreventivo: string;
  consegnaMetodo: PreventivoConsegna;
  spedizioneACarico: "cliente" | "agrinsicilia" | "diviso";
  spedizioneBase: number | "";
  spedizioneFonte: PreventivoSpedizioneFonte;
  tipoPagamento: OrdineTipoPagamento;
  giorniConsegna: string;
  note: string;
  ivaDocumento: number;
  validitaGiorni: number;
  righe: PreventivoSessioneRiga[];
  invioEmail: string;
  updatedAt?: string;
};

export function loadPreventivoSessione(): PreventivoSessione | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(PREVENTIVO_SESSIONE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PreventivoSessione;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function savePreventivoSessione(sessione: PreventivoSessione): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(
      PREVENTIVO_SESSIONE_KEY,
      JSON.stringify({ ...sessione, updatedAt: new Date().toISOString() })
    );
  } catch {
    /* quota / private mode */
  }
}

export function clearPreventivoSessione(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(PREVENTIVO_SESSIONE_KEY);
  } catch {
    /* ignore */
  }
}

export function labelIntenzionePreventivo(
  intenzione: PreventivoIntenzione
): string {
  if (intenzione === "inviato") return "Inviato (prova)";
  if (intenzione === "salvato") return "Salvato";
  return "Bozza";
}
