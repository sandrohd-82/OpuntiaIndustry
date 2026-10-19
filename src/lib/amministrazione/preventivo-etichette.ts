import { formatPreventivoDataIt } from "@/lib/amministrazione/preventivo-letterhead";

export type VoceEtichettaPreventivo = {
  key: string;
  etichetta: string;
  text: string;
};

/** Voci fisse del foglio. I numeri, gli IBAN e i nomi propri restano fuori. */
export const ETICHETTE_PREVENTIVO: Array<{ key: string; text: string }> = [
  { key: "documento", text: "PREVENTIVO" },
  { key: "nr", text: "nr." },
  { key: "del", text: "del" },
  { key: "commerciale", text: "Commerciale di riferimento" },
  { key: "telefono", text: "Telefono" },
  { key: "email", text: "Email" },
  { key: "piva", text: "P.iva" },
  { key: "cf", text: "C.F." },
  { key: "cell", text: "cell" },
  { key: "destinatario", text: "Destinatario" },
  { key: "pivaCliente", text: "P.IVA" },
  { key: "cfCliente", text: "CF" },
  { key: "codice", text: "Codice" },
  { key: "nomeProdotto", text: "Nome prodotto" },
  { key: "prezzoU", text: "Prezzo U" },
  { key: "qty", text: "Qty" },
  { key: "sconto", text: "Sconto" },
  { key: "prezzoScontato", text: "U. scontato" },
  { key: "totale", text: "Totale" },
  { key: "extra", text: "extra" },
  { key: "nessunConf", text: "Nessun dettaglio di confezionamento" },
  { key: "contributo", text: "Contributo spese di spedizione" },
  { key: "totaleCalcolare", text: "Totale da calcolare" },
  { key: "spedizione", text: "Spedizione e consegna" },
  { key: "giorni", text: "Giorni di consegna" },
  { key: "modalita", text: "Modalità di Pagamento" },
  { key: "banca", text: "Banca" },
  { key: "iban", text: "IBAN" },
  { key: "bic", text: "BIC" },
  { key: "importo", text: "Importo" },
  { key: "causale", text: "Causale" },
  { key: "totali", text: "Totali" },
  { key: "imponibile", text: "Imponibile" },
  { key: "totaleIva", text: "Totale IVA" },
  { key: "totalePreventivo", text: "Totale Preventivo" },
  {
    key: "vuotoRighe",
    text: "Codice, nome, prezzo, quantità, sconto e totale…",
  },
];

export function etichettaPreventivo(
  mappa: Record<string, string> | undefined,
  chiave: string,
  italiano: string
): string {
  const valore = mappa?.[chiave]?.trim();
  return valore || italiano;
}

export function notaScontoRigaPreventivo(riga: {
  scontoListinoPct?: number;
  scontoListinoStandardPct?: number;
}): string {
  const applicatoListino = riga.scontoListinoPct ?? 0;
  const standard = riga.scontoListinoStandardPct ?? applicatoListino;
  if (applicatoListino + 0.0001 < standard) {
    if (applicatoListino > 0) {
      return `Sconto standard ridotto al ${applicatoListino.toLocaleString("it-IT")}% (listino ${standard.toLocaleString("it-IT")}%).`;
    }
    return "Sconto standard annullato.";
  }
  return "Sconto applicato a proposta di confezionamento.";
}

export function fraseCausalePreventivo(numero: string, dataIso: string): string {
  return `Pagamento Preventivo n. ${numero} del ${formatPreventivoDataIt(dataIso)}.`;
}

export function fraseValiditaPreventivo(giorni: number): string {
  return `Validità preventivo ${giorni} gg.`;
}

export function vociEtichetteFissePreventivo(): VoceEtichettaPreventivo[] {
  return ETICHETTE_PREVENTIVO.map((voce) => ({
    key: voce.key,
    etichetta: voce.text,
    text: voce.text,
  }));
}
