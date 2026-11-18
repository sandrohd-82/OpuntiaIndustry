import type { DocumentoPianificazione } from "@/lib/produzione/documento-pianificazione";
import { MESSAGGIO_CONFERMA_INCERTA } from "@/lib/produzione/notifica-distribuzione";
import { classificaErroreInvio } from "@/lib/produzione/richiesta-ingresso";

export const DESTINATARIO_PROVA = "sandrohd@gmail.com";

const EMAIL = /^[^\s,;@]+@[^\s,;@]+\.[^\s,;@]+$/;

export type StatoInvioConfermato = "non_inviata" | "in_invio" | "inviata" | "fallita" | "incerta";

export type EsitoInvioConfermato = {
  id: string | null;
  stato: StatoInvioConfermato;
  richiedeConferma: boolean;
  errore: string | null;
};

export type ConsegnaSalvata = {
  data: string;
  materia: string;
  unita: string;
  quantita: number;
  tipoQuantita: "precisa" | "stimata";
  stato: string;
};

/** Il documento nasce dalle righe già salvate. Non accetta un file inviato dal browser. */
export function documentoDalleRigheSalvate(input: {
  codice: string;
  fornitore: string;
  note: string;
  periodoInizio: string;
  periodoFine: string;
  consegne: readonly ConsegnaSalvata[];
}): DocumentoPianificazione {
  const materie = [...new Set(input.consegne.map((consegna) => consegna.materia))].sort((a, b) =>
    a.localeCompare(b)
  );
  const unita = [...new Set(input.consegne.map((consegna) => consegna.unita))];
  return {
    codice: input.codice,
    fornitore: input.fornitore,
    materia: materie.length === 1 ? materie[0] : materie.join(", "),
    unita: unita.length === 1 ? unita[0] : "",
    periodoInizio: input.periodoInizio,
    periodoFine: input.periodoFine,
    note: input.note,
    consegne: input.consegne.map((consegna) => ({
      data: consegna.data,
      quantita: consegna.quantita,
      tipoQuantita: consegna.tipoQuantita,
      stato: consegna.stato,
      unita: consegna.unita,
    })),
  };
}

export function chiaveInvioConfermato(chiaveSalvataggio: string): string {
  return `${chiaveSalvataggio}:invio`;
}

export function nomeAllegatoConfermato(codice: string): string {
  const pulito = codice.trim().replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "");
  return pulito || "ordine-approvvigionamento";
}

export function bozzaInvioConferma(prova: boolean): { oggetto: string; testo: string } {
  const oggetto = prova
    ? "TEST — Ordine di approvvigionamento"
    : "Ordine di approvvigionamento";
  const testo = [
    prova ? "TEST" : "",
    "Agrinsicilia ha registrato un ordine di approvvigionamento.",
    "La versione confermata e negli allegati selezionati.",
    "Questa mail non pubblica l'ordine nel portale fornitore.",
    "Non conferma la lettura, non e un'accettazione e non garantisce la consegna.",
    "",
    "Il codice confermato viene aggiunto dopo il salvataggio.",
  ]
    .filter((riga, indice) => indice > 0 || riga.length > 0)
    .join("\n");
  return { oggetto, testo };
}

export function testoConRiferimento(testo: string, codice: string): string {
  if (testo.includes(codice)) return testo;
  return `${testo.trim()}\n\nRiferimento confermato: ${codice}`;
}

export function validaDestinatarioSingolo(valore: string): { ok: true; email: string } | { ok: false; motivo: string } {
  const email = valore.trim().toLowerCase();
  if (!email || email.includes(",") || email.includes(";")) {
    return { ok: false, motivo: "Indica un solo destinatario." };
  }
  if (!EMAIL.test(email)) return { ok: false, motivo: "Indirizzo email non valido." };
  return { ok: true, email };
}

export function rifiutaEmailFornitore(destinatario: string, emailFornitore: string | null): string | null {
  const fornitore = (emailFornitore ?? "").trim().toLowerCase();
  if (fornitore && destinatario.trim().toLowerCase() === fornitore) {
    return "In prova non si usa l'indirizzo del fornitore in anagrafica.";
  }
  return null;
}

export function messaggioSalvataggioConfermato(input: {
  riusata: boolean;
  invioRichiesto: boolean;
  confermato?: boolean;
  invio: EsitoInvioConfermato | null;
}): { messaggio: string; errore: string | null } {
  if (!input.invioRichiesto) {
    if (input.confermato) {
      return {
        messaggio: input.riusata
          ? "Operazione già registrata. Nessun secondo ordine e nessuna email."
          : "Ordine registrato ed è visibile in elenco. Nessuna email e nessuna pubblicazione.",
        errore: null,
      };
    }
    return {
      messaggio: input.riusata
        ? "Operazione già registrata. Nessun secondo ordine e nessuna email."
        : "Bozza salvata. Non è stata pubblicata e non è stata inviata.",
      errore: null,
    };
  }
  const stato = input.invio?.stato ?? "non_inviata";
  const base = input.riusata
    ? "Operazione già registrata."
    : "Ordine registrato ed è visibile in elenco.";
  if (stato === "inviata") return { messaggio: `${base} Email inviata.`, errore: null };
  if (stato === "in_invio") return { messaggio: `${base} Invio già in corso.`, errore: null };
  if (stato === "fallita") {
    return {
      messaggio: base,
      errore: input.invio?.errore ?? "Invio non riuscito. Il server non ha accettato il messaggio: si può riprovare.",
    };
  }
  if (stato === "incerta") return { messaggio: base, errore: MESSAGGIO_CONFERMA_INCERTA };
  return { messaggio: base, errore: input.invio?.errore ?? "Email non accodata." };
}

export function messaggioEliminazioneProva(protetti: number): string {
  if (protetti > 0) {
    return "Dati di prova eliminati, tranne gli invii in corso o con esito incerto e gli ordini collegati. Quei riferimenti restano per ricostruire l'esito. Un reinvio dopo un esito incerto può duplicare la mail.";
  }
  return "Dati di prova eliminati. Gli ordini aziendali non sono stati modificati.";
}

export type InvioDaSelezionare = {
  id: string;
  prova: boolean;
  stato: StatoInvioConfermato;
  ordineId: string | null;
  pianoId: string | null;
};

/** Stessa regola della funzione SQL: nessun id arriva dal browser e i dati reali restano fuori. */
export function selezioneEliminazioneProva(input: {
  invii: readonly InvioDaSelezionare[];
  ordini: readonly { id: string; prova: boolean; pianoId: string | null }[];
  piani: readonly { id: string; prova: boolean }[];
}): {
  eliminaOrdini: string[];
  eliminaPiani: string[];
  annullaInvii: string[];
  eliminaInvii: string[];
  protetti: string[];
} {
  const inviiProva = input.invii.filter((invio) => invio.prova);
  const protettiInvii = inviiProva.filter((invio) => invio.stato === "in_invio" || invio.stato === "incerta");
  const ordiniProtetti = new Set<string>();
  const pianiProtetti = new Set<string>();
  for (const invio of protettiInvii) {
    if (invio.ordineId) ordiniProtetti.add(invio.ordineId);
    if (invio.pianoId) pianiProtetti.add(invio.pianoId);
  }
  for (const ordine of input.ordini) {
    if (ordine.prova && ordine.pianoId && ordiniProtetti.has(ordine.id)) pianiProtetti.add(ordine.pianoId);
  }
  for (const ordine of input.ordini) {
    if (ordine.prova && ordine.pianoId && pianiProtetti.has(ordine.pianoId)) ordiniProtetti.add(ordine.id);
  }
  return {
    eliminaOrdini: input.ordini.filter((ordine) => ordine.prova && !ordiniProtetti.has(ordine.id)).map((ordine) => ordine.id),
    eliminaPiani: input.piani.filter((piano) => piano.prova && !pianiProtetti.has(piano.id)).map((piano) => piano.id),
    annullaInvii: inviiProva.filter((invio) => invio.stato === "non_inviata").map((invio) => invio.id),
    eliminaInvii: inviiProva
      .filter((invio) => invio.stato !== "in_invio" && invio.stato !== "incerta")
      .map((invio) => invio.id),
    protetti: protettiInvii.map((invio) => invio.id),
  };
}

export async function allegatiConfermati(input: {
  documento: DocumentoPianificazione;
  pdf: boolean;
  xlsx: boolean;
  pdfBytes: (documento: DocumentoPianificazione) => Uint8Array;
  xlsxBytes: (documento: DocumentoPianificazione) => Promise<Uint8Array>;
}): Promise<Array<{ filename: string; content: Buffer; contentType: string }>> {
  const nome = nomeAllegatoConfermato(input.documento.codice);
  const allegati: Array<{ filename: string; content: Buffer; contentType: string }> = [];
  if (input.pdf) {
    allegati.push({
      filename: `${nome}.pdf`,
      content: Buffer.from(input.pdfBytes(input.documento)),
      contentType: "application/pdf",
    });
  }
  if (input.xlsx) {
    allegati.push({
      filename: `${nome}.xlsx`,
      content: Buffer.from(await input.xlsxBytes(input.documento)),
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
  }
  return allegati;
}

/**
 * Un solo tentativo per lock. Se l'esito resta incerto non parte un altro invio:
 * l'assenza di un duplicato SMTP non è garantita.
 */
export async function concludiTentativoInvio(input: {
  acquisita: boolean;
  statoAttuale: string;
  invia: () => Promise<{ messageId: string | null }>;
  concludi: (esito: {
    esito: "inviata" | "fallita" | "incerta";
    errore: string | null;
    messageId: string | null;
  }) => Promise<boolean>;
}): Promise<EsitoInvioConfermato> {
  if (!input.acquisita) {
    const stato = normalizzaStato(input.statoAttuale);
    const richiedeConferma = stato === "incerta" || stato === "in_invio";
    return {
      id: null,
      stato,
      richiedeConferma,
      errore: richiedeConferma ? MESSAGGIO_CONFERMA_INCERTA : null,
    };
  }
  try {
    const inviata = await input.invia();
    const chiusa = await input.concludi({
      esito: "inviata",
      errore: null,
      messageId: inviata.messageId,
    });
    if (!chiusa) {
      return { id: null, stato: "incerta", richiedeConferma: true, errore: MESSAGGIO_CONFERMA_INCERTA };
    }
    return { id: null, stato: "inviata", richiedeConferma: false, errore: null };
  } catch (errore) {
    const testo = errore instanceof Error ? errore.message : "Invio non riuscito.";
    const esito = classificaErroreInvio(testo) === "certo" ? "fallita" : "incerta";
    await input.concludi({ esito, errore: testo, messageId: null });
    return {
      id: null,
      stato: esito,
      richiedeConferma: esito === "incerta",
      errore: esito === "incerta" ? MESSAGGIO_CONFERMA_INCERTA : testo,
    };
  }
}

function normalizzaStato(valore: string): StatoInvioConfermato {
  if (valore === "in_invio" || valore === "inviata" || valore === "fallita" || valore === "incerta") return valore;
  return "non_inviata";
}
