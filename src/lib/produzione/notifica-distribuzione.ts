import type { AmbitoLineaGuida } from "@/lib/produzione/haccp-versioni";
import type { NotificaRichiestaStato } from "@/lib/produzione/richiesta-ingresso";

export type CanaleNotificaDistribuzione = "haccp" | "testo" | "approvvigionamento";

export const MESSAGGIO_CONFERMA_INCERTA =
  "Esito incerto: serve una conferma esplicita. Il reinvio potrebbe produrre una seconda email.";

/** Una distribuzione puntuale non cambia l'ambito e non allarga i destinatari permanenti. */
export function effettoDistribuzionePuntuale(input: {
  ambito: AmbitoLineaGuida;
  destinatari: readonly string[];
  fornitoreId: string;
}): {
  ambito: AmbitoLineaGuida;
  destinatari: readonly string[];
  distribuzione: { fornitoreId: string };
} {
  return {
    ambito: input.ambito,
    destinatari: input.destinatari,
    distribuzione: { fornitoreId: input.fornitoreId },
  };
}

/** La pubblicazione congela la versione. Non sceglie i fornitori. */
export function fornitoriDellaNuovaPubblicazione(): readonly string[] {
  return [];
}

export function puoInviareNotificaDistribuzione(
  canale: CanaleNotificaDistribuzione,
  soggetto: { superadmin: boolean; aree: readonly string[] }
): boolean {
  if (soggetto.superadmin) return true;
  if (canale === "testo") return soggetto.aree.includes("amministrazione");
  return (
    soggetto.aree.includes("produzione") || soggetto.aree.includes("amministrazione")
  );
}

export function comeStatoNotificaDistribuzione(valore: string): NotificaRichiestaStato {
  if (
    valore === "non_inviata" ||
    valore === "in_invio" ||
    valore === "inviata" ||
    valore === "fallita" ||
    valore === "incerta"
  ) {
    return valore;
  }
  return "non_inviata";
}

export function testoErroreInvio(errore: unknown): string {
  const testo = errore instanceof Error ? errore.message : "Invio non riuscito.";
  if (testo.includes("@")) return "Invio non riuscito.";
  return testo.slice(0, 400);
}
