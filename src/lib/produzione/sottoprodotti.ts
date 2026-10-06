import { z } from "zod";

/** Messaggio quando si chiude un foglio con una prenotazione ancora aperta. */
export const SOTTOPRODOTTO_CHIUSURA_MSG =
  "Questo foglio ha un secondo prodotto prenotato. Prima di chiudere indica quanto prodotto di partenza è stato consumato, quale secondo prodotto è nato e in che quantità.";

export type SottoprodottoStato = "prenotato" | "registrato";

export type SottoprodottoPrenotazione = {
  id: string;
  campionaturaId: string;
  numeroDocumento: string;
  processoCodice: string;
  processoNome: string;
  lottoInternoCodice: string;
  prodottoIngressoId: string | null;
  prodottoIngressoCodice: string;
  prodottoUscitaId: string | null;
  prodottoUscitaCodice: string;
  qtyUscita: number;
  unita: string;
};

const qtyPositiva = z.number().positive().max(1_000_000);

export const registraSottoprodottiSchema = z.object({
  foglioId: z.string().uuid(),
  codiceProdottoUscita: z.string().trim().min(1).max(200),
  righe: z
    .array(
      z.object({
        id: z.string().uuid(),
        qtyConsumata: qtyPositiva,
        prodottoSottoprodottoId: z.string().uuid(),
        qtySottoprodotto: qtyPositiva,
      })
    )
    .min(1),
});

export type RegistraSottoprodottiInput = z.infer<
  typeof registraSottoprodottiSchema
>;

/** Il codice prodotto del foglio è "CODICE — nome". */
export function codiceProdottoDaTestoFoglio(testo: string): string {
  const raw = testo.trim();
  if (!raw) return "";
  const head = raw.split(/\s+[—–-]\s+/)[0]?.trim() ?? raw;
  return head;
}

export function prodottoUscitaCompatibile(
  testoFoglio: string,
  codicePrenotazione: string
): boolean {
  const foglio = codiceProdottoDaTestoFoglio(testoFoglio).toUpperCase();
  const codice = codicePrenotazione.trim().toUpperCase();
  if (!foglio || !codice) return false;
  return foglio === codice;
}
