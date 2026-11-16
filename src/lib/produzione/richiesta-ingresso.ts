import type { SoggettoAccessoFornitore } from "@/lib/produzione/fornitore-accesso";

export type NotificaRichiestaStato =
  | "non_inviata"
  | "in_invio"
  | "inviata"
  | "fallita"
  | "incerta";

/**
 * Nodemailer su questo invio non imposta timeout propri.
 * La connessione scade a 2 minuti, il greeting a 30 secondi,
 * il socket SMTP a 10 minuti. La copia IMAP successiva scade a 5 minuti.
 * Il recupero di un lock ancora in corso aspetta la somma, più 30 secondi.
 */
export const LEASE_CONNESSIONE_SMTP_MS = 2 * 60 * 1000;
export const LEASE_INVIO_SICURO_MS = (2 * 60 + 30 + 10 * 60 + 5 * 60 + 30) * 1000;

export type PianoRichiestaIngresso =
  | { ok: false; motivo: string }
  | { ok: true; creaFoglio: boolean; inviaNotifica: boolean };

export type SnapshotNotifica = {
  stato: NotificaRichiestaStato;
  lock: string | null;
  lockAtMs: number | null;
  tentativi: number;
};

export function tipologiaIdoneaMaterialeIngresso(tipologie: readonly string[]): boolean {
  return tipologie.includes("materia_prima");
}

export function puoInviareRichiestaDaScheda(soggetto: SoggettoAccessoFornitore): boolean {
  return soggetto.superadmin || soggetto.aree.includes("amministrazione");
}

/**
 * Una chiave già usata non apre un altro foglio.
 * L'invio parte solo da non_inviata o fallita: in_invio e incerta non partono da soli.
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
      inviaNotifica: reinvioAutomaticoConsentito(input.notificaStato),
    };
  }
  return { ok: true, creaFoglio: true, inviaNotifica: true };
}

export function reinvioAutomaticoConsentito(
  stato: NotificaRichiestaStato | null
): boolean {
  return stato === "non_inviata" || stato === "fallita";
}

export function puoAcquisireInvio(input: {
  stato: NotificaRichiestaStato;
  lockAtMs: number | null;
  oraMs: number;
  confermaIncerta: boolean;
}): boolean {
  if (input.stato === "non_inviata" || input.stato === "fallita") return true;
  if (input.stato === "incerta") return input.confermaIncerta;
  if (input.stato === "in_invio") {
    if (!input.confermaIncerta || input.lockAtMs == null) return false;
    return input.oraMs - input.lockAtMs >= LEASE_INVIO_SICURO_MS;
  }
  return false;
}

/** Applica l'esito di un UPDATE già serializzato: il secondo chiamante vede lo stato del primo. */
export function applicaAcquisizione(
  attuale: SnapshotNotifica,
  input: { oraMs: number; confermaIncerta: boolean; nuovoLock: string }
): SnapshotNotifica & { acquisita: boolean } {
  const consentita = puoAcquisireInvio({
    stato: attuale.stato,
    lockAtMs: attuale.lockAtMs,
    oraMs: input.oraMs,
    confermaIncerta: input.confermaIncerta,
  });
  if (!consentita) return { ...attuale, acquisita: false };
  return {
    stato: "in_invio",
    lock: input.nuovoLock,
    lockAtMs: input.oraMs,
    tentativi: attuale.tentativi + 1,
    acquisita: true,
  };
}

export function conclusioneValida(input: {
  stato: NotificaRichiestaStato;
  lock: string | null;
  token: string;
}): boolean {
  return input.stato === "in_invio" && input.lock != null && input.lock === input.token;
}

const ERRORI_SMTP_CERTI = [
  /manca la casella/i,
  /econnrefused/i,
  /enotfound/i,
  /eai_again/i,
  /getaddrinfo/i,
  /greeting never received/i,
  /timed out while connecting/i,
  /connection timeout/i,
  /invalid login/i,
  /authentication failed/i,
  /535[- ]/,
  /\b525\b/,
  /disabilitato per la casella/i,
  /sending temporarily disabled/i,
];

/** Un errore è certo solo se è avvenuto prima che il server potesse accettare il messaggio. */
export function classificaErroreInvio(testo: string): "certo" | "incerto" {
  const valore = testo.trim();
  if (!valore) return "incerto";
  if (ERRORI_SMTP_CERTI.some((regola) => regola.test(valore))) return "certo";
  return "incerto";
}

export function notificaRichiedeConfermaRecupero(input: {
  stato: NotificaRichiestaStato;
  lockAt: string | null;
  oraMs: number;
}): boolean {
  if (input.stato === "incerta") return true;
  if (input.stato !== "in_invio") return false;
  if (!input.lockAt) return false;
  const at = Date.parse(input.lockAt);
  if (Number.isNaN(at)) return false;
  return input.oraMs - at >= LEASE_INVIO_SICURO_MS;
}

/** Un invio SMTP non è una ricevuta e non è una presa visione. */
export function notificaRisultaLetta(_stato: NotificaRichiestaStato): boolean {
  return false;
}

export function etichettaNotificaRichiesta(
  stato: NotificaRichiestaStato,
  contesto?: { lockAt?: string | null; oraMs?: number }
): string {
  if (stato === "inviata") return "Notifica inviata";
  if (stato === "fallita") return "Invio fallito";
  if (stato === "incerta") return "Esito incerto";
  if (stato === "in_invio") {
    const incerto = notificaRichiedeConfermaRecupero({
      stato,
      lockAt: contesto?.lockAt ?? null,
      oraMs: contesto?.oraMs ?? Date.now(),
    });
    return incerto ? "Esito incerto" : "Invio in corso";
  }
  return "Notifica da inviare";
}
