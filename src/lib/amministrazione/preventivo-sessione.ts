import type { DestinatarioPreventivo } from "@/lib/amministrazione/preventivo-letterhead";
import type { PreventivoCommercialeRiferimento } from "@/lib/amministrazione/preventivo-commerciale-riferimento";
import type { OrdineTipoPagamento } from "@/lib/amministrazione/ordini";
import type { PreventivoConsegna } from "@/lib/amministrazione/preventivi";
import type { PreventivoSpedizioneFonte } from "@/lib/amministrazione/preventivo-spedizione";

export const PREVENTIVO_SESSIONE_KEY = "opuntia.preventivo.sessione-provvisoria";

/**
 * Tenere a false: bozza e invio si scrivono in archivio.
 * true era la sessione di prova, solo in questo browser e senza email.
 */
export const PREVENTIVI_SESSIONE_PROVA = false;

export const PREVENTIVI_SESSIONE_PROVA_MSG =
  "Sessione di prova: il preventivo resta solo in questo browser. Non viene scritto in archivio e non parte nessuna email.";

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
  scontoListinoPct?: number;
  scontoListinoStandardPct?: number;
  scontoListinoTarga?: string;
  scontoSuddivisioneAttiva?: boolean;
  scontoQuotaAziendaPct?: number;
  scontoQuotaCommercialePct?: number;
  confezioneValue: string;
  confezionamento: string;
  imballaggioVoceId: string | null;
  accordoId?: string | null;
  accordoModalita?: "sconto_percentuale" | "prezzo_fisso" | null;
  accordoValoreOrigine?: number | null;
  accordoGiustificazione?: string;
  accordoForzato?: boolean;
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
  if (intenzione === "inviato") {
    return PREVENTIVI_SESSIONE_PROVA ? "Inviato (prova)" : "Inviato";
  }
  if (intenzione === "salvato") return "Salvato";
  return "Bozza";
}
