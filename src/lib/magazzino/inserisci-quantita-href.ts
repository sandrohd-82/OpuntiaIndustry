import {
  isMagazzinoCaricoUnita,
  type MagazzinoCaricoUnita,
} from "@/lib/magazzino/types";

export const INSERISCI_QUANTITA_PATH =
  "/app/magazzino/prodotti-agrinsicilia/inserisci-quantita";

export type InserisciQuantitaPrefill = {
  prodottoId: string;
  quantita?: number | null;
  unita?: string | null;
  lotto?: string | null;
  foglioCodice?: string | null;
  ubicazioneId?: string | null;
};

/** Stock interno (kg/lt/pz) → valore da mostrare nel campo quantità. */
export function quantitaInputDaStock(
  stock: number,
  um: MagazzinoCaricoUnita
): number {
  const q = um === "g" || um === "ml" ? stock * 1000 : stock;
  return Math.round(q * 1000) / 1000;
}

export function hrefInserisciQuantita(p: InserisciQuantitaPrefill): string {
  const q = new URLSearchParams();
  q.set("prodotto", p.prodottoId);
  q.set("da", "elenco");
  if (p.quantita != null && Number.isFinite(p.quantita) && p.quantita > 0) {
    q.set("q", String(p.quantita));
  }
  if (p.unita && isMagazzinoCaricoUnita(p.unita)) {
    q.set("unita", p.unita);
  }
  if (p.lotto?.trim()) q.set("lotto", p.lotto.trim());
  if (p.foglioCodice?.trim()) q.set("foglio", p.foglioCodice.trim());
  if (p.ubicazioneId?.trim()) q.set("ubi", p.ubicazioneId.trim());
  return `${INSERISCI_QUANTITA_PATH}?${q.toString()}`;
}
