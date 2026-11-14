import type { SoggettoAccessoFornitore } from "@/lib/produzione/fornitore-accesso";

export type NotificaRichiestaStato = "non_inviata" | "inviata" | "fallita";

export type PianoRichiestaIngresso =
  | { ok: false; motivo: string }
  | { ok: true; creaFoglio: boolean; inviaNotifica: boolean };

export function tipologiaIdoneaMaterialeIngresso(tipologie: readonly string[]): boolean {
  return tipologie.includes("materia_prima");
}

export function puoInviareRichiestaDaScheda(soggetto: SoggettoAccessoFornitore): boolean {
  return soggetto.superadmin || soggetto.aree.includes("amministrazione");
}

/**
 * Una chiave già usata non apre un altro foglio.
 * L'invio riuscito non diventa una conferma di lettura.
 */
export function pianoRichiestaIngresso(input: {
  tipologie: readonly string[];
  accountAttivi: number;
  richiestaEsistente: boolean;
  notificaStato: NotificaRichiestaStato | null;
}): PianoRichiestaIngresso {
  if (!tipologiaIdoneaMaterialeIngresso(input.tipologie)) {
    return {
      ok: false,
      motivo: "Il fornitore non è idoneo: serve la tipologia Materia prima.",
    };
  }
  if (input.accountAttivi < 1) {
    return {
      ok: false,
      motivo: "Nessun account attivo collegato a questo fornitore.",
    };
  }
  if (input.richiestaEsistente) {
    return {
      ok: true,
      creaFoglio: false,
      inviaNotifica: input.notificaStato !== "inviata",
    };
  }
  return { ok: true, creaFoglio: true, inviaNotifica: true };
}

/** Un invio SMTP non è una ricevuta e non è una presa visione. */
export function notificaRisultaLetta(_stato: NotificaRichiestaStato): boolean {
  return false;
}

export function etichettaNotificaRichiesta(stato: NotificaRichiestaStato): string {
  if (stato === "inviata") return "Notifica inviata";
  if (stato === "fallita") return "Notifica non consegnata";
  return "Notifica in attesa";
}
