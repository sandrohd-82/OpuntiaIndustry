export const CAMPIONATURA_ORDINE_NOTA =
  "La campionatura non compare in fattura. Viene lavorata insieme all'ordine e inserita nel collo di spedizione.";

export type CampionaturaOrdineVoce = {
  prodottoId: string;
  prodottoCodice: string;
  prodottoNome: string;
  numeroConfezioni: number;
};
