export type ModalitaSpedizionePrezzoOrdine =
  | "non_applicabile"
  | "inserito"
  | "richiesto";

export type SpedizioneIvaModoOrdine = "compreso" | "piu_iva";

export const BLOCCO_DOCUMENTI_CLIENTE_ORDINE =
  "Fattura, proforma e mail restano bloccate: manca la conferma del costo di spedizione. Anche dopo, nulla parte verso il cliente senza un invio esplicito.";

export function ordineAttendeCalcoloSpedizione(
  modalita: string | null | undefined
): boolean {
  return modalita === "richiesto";
}

export function risolviSpedizioneOrdineDiretto(input: {
  campionatura: boolean;
  preventivoId: string | null;
  aCarico: "cliente" | "agrinsicilia" | "diviso";
  modalitaRichiesta: ModalitaSpedizionePrezzoOrdine;
  importo: number;
  ivaModo: SpedizioneIvaModoOrdine;
}):
  | {
      ok: true;
      modalita: ModalitaSpedizionePrezzoOrdine;
      importo: number;
      ivaModo: SpedizioneIvaModoOrdine;
      trasportoImponibile: number;
      trasportoIva: number;
    }
  | { ok: false; error: string } {
  const ivaModo = input.ivaModo === "compreso" ? "compreso" : "piu_iva";
  const importoChiesto = Math.round(Math.max(0, input.importo) * 100) / 100;
  if (input.campionatura || input.aCarico !== "cliente") {
    return {
      ok: true,
      modalita: "non_applicabile",
      importo: 0,
      ivaModo,
      trasportoImponibile: 0,
      trasportoIva: 22,
    };
  }
  if (input.modalitaRichiesta === "richiesto") {
    if (input.preventivoId) {
      return {
        ok: false,
        error:
          "Il calcolo spedizione si chiede solo se l'ordine non nasce da un preventivo.",
      };
    }
    return {
      ok: true,
      modalita: "richiesto",
      importo: 0,
      ivaModo,
      trasportoImponibile: 0,
      trasportoIva: ivaModo === "compreso" ? 0 : 22,
    };
  }
  return {
    ok: true,
    modalita: "inserito",
    importo: importoChiesto,
    ivaModo,
    trasportoImponibile: importoChiesto,
    trasportoIva: ivaModo === "compreso" ? 0 : 22,
  };
}
