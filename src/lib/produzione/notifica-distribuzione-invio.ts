import { inviaDaCasellaAnagrafica } from "@/lib/anagrafica/casella-invio";
import { primoIndirizzoEmail } from "@/lib/produzione/haccp-versioni";
import {
  comeStatoNotificaDistribuzione,
  testoErroreInvio,
  type CanaleNotificaDistribuzione,
} from "@/lib/produzione/notifica-distribuzione";
import {
  classificaErroreInvio,
  puoAcquisireInvio,
  type NotificaRichiestaStato,
} from "@/lib/produzione/richiesta-ingresso";
import { createClient } from "@/lib/supabase/server";

export type EsitoInvioDistribuzione =
  | { tipo: "stato"; stato: NotificaRichiestaStato }
  | { tipo: "in_corso" }
  | { tipo: "conferma_richiesta" };

type Acquisizione = {
  acquisita: boolean;
  lock_id: string | null;
  stato: string | null;
};

function primaRiga<T>(data: unknown): T | null {
  if (Array.isArray(data)) return (data[0] as T | undefined) ?? null;
  if (data && typeof data === "object") return data as T;
  return null;
}

async function leggiStato(
  canale: CanaleNotificaDistribuzione,
  distribuzioneId: string
): Promise<NotificaRichiestaStato> {
  const supabase = await createClient();
  const tabella =
    canale === "haccp"
      ? "haccp_linee_guida_distribuzioni"
      : canale === "approvvigionamento"
        ? "approvvigionamenti_notifiche"
        : "fornitori_testi_distribuzioni";
  const { data } = await supabase
    .from(tabella)
    .select("notifica_stato")
    .eq("id", distribuzioneId)
    .maybeSingle();
  return comeStatoNotificaDistribuzione(String(data?.notifica_stato ?? ""));
}

async function concludi(input: {
  canale: CanaleNotificaDistribuzione;
  distribuzioneId: string;
  lock: string;
  esito: "inviata" | "fallita" | "incerta";
  errore: string | null;
  messageId: string | null;
}): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("concludi_notifica_distribuzione", {
    p_canale: input.canale,
    p_distribuzione_id: input.distribuzioneId,
    p_lock: input.lock,
    p_esito: input.esito,
    p_errore: input.errore,
    p_message_id: input.messageId,
  });
  if (error) return false;
  const riga = primaRiga<{ aggiornata: boolean }>(data);
  return Boolean(riga?.aggiornata);
}

export async function messaggioDistribuzioneHaccp(distribuzioneId: string): Promise<{
  to: string | null;
  subject: string;
  text: string;
}> {
  const supabase = await createClient();
  const { data: riga } = await supabase
    .from("haccp_linee_guida_distribuzioni")
    .select("fornitore_id, versione_id")
    .eq("id", distribuzioneId)
    .maybeSingle();
  const [{ data: versione }, { data: fornitore }] = await Promise.all([
    supabase
      .from("haccp_linee_guida_versioni")
      .select("numero, titolo")
      .eq("id", riga?.versione_id ?? "")
      .maybeSingle(),
    supabase.from("fornitori").select("email").eq("id", riga?.fornitore_id ?? "").maybeSingle(),
  ]);
  const titolo = String(versione?.titolo ?? "Linea guida");
  const numero = Number(versione?.numero) || 0;
  return {
    to: primoIndirizzoEmail(String(fornitore?.email ?? "")),
    subject: `Linee guida ${titolo}, versione ${numero}`,
    text: [
      `Agrinsicilia ha reso disponibile la versione ${numero} del documento «${titolo}».`,
      "",
      "Il testo si legge in Gestionale fornitori, sezione Linee guida.",
      "Questa mail è solo l'avviso. Se non arriva, il documento resta nel gestionale.",
      "La presa visione si registra lì e vale solo per la versione ricevuta.",
      "",
      "https://www.opuntiaindustry.com/app/area-fornitori/linee-guida",
    ].join("\n"),
  };
}

export async function messaggioDistribuzioneTesto(distribuzioneId: string): Promise<{
  to: string | null;
  subject: string;
  text: string;
}> {
  const supabase = await createClient();
  const { data: riga } = await supabase
    .from("fornitori_testi_distribuzioni")
    .select("fornitore_id, versione_id")
    .eq("id", distribuzioneId)
    .maybeSingle();
  const [{ data: versione }, { data: fornitore }] = await Promise.all([
    supabase
      .from("fornitori_testi_versioni")
      .select("numero, titolo")
      .eq("id", riga?.versione_id ?? "")
      .maybeSingle(),
    supabase.from("fornitori").select("email").eq("id", riga?.fornitore_id ?? "").maybeSingle(),
  ]);
  return {
    to: primoIndirizzoEmail(String(fornitore?.email ?? "")),
    subject: `Documento ${String(versione?.titolo ?? "abilitazione")}, versione ${Number(versione?.numero) || 0}`,
    text: [
      "Agrinsicilia ha reso disponibile un documento di abilitazione.",
      "Si legge in Gestionale fornitori, sezione Documenti, dopo l'accesso.",
      "Questa mail è solo l'avviso. Non conferma la lettura né una firma.",
      "",
      "https://www.opuntiaindustry.com/app/area-fornitori/documenti",
    ].join("\n"),
  };
}

export async function eseguiNotificaDistribuzione(input: {
  canale: CanaleNotificaDistribuzione;
  distribuzioneId: string;
  confermaIncerta: boolean;
  messaggio: () => Promise<{ to: string | null; subject: string; text: string }>;
}): Promise<EsitoInvioDistribuzione> {
  const supabase = await createClient();
  const tabella =
    input.canale === "haccp"
      ? "haccp_linee_guida_distribuzioni"
      : input.canale === "approvvigionamento"
        ? "approvvigionamenti_notifiche"
        : "fornitori_testi_distribuzioni";
  const { data: prima } = await supabase
    .from(tabella)
    .select("notifica_stato, notifica_lock_at")
    .eq("id", input.distribuzioneId)
    .is("deleted_at", null)
    .maybeSingle();
  const statoLetto = comeStatoNotificaDistribuzione(String(prima?.notifica_stato ?? ""));
  const lockAtMs = prima?.notifica_lock_at ? Date.parse(String(prima.notifica_lock_at)) : null;
  const lockValido = lockAtMs == null || Number.isNaN(lockAtMs) ? null : lockAtMs;
  if (
    !puoAcquisireInvio({
      stato: statoLetto,
      lockAtMs: lockValido,
      oraMs: Date.now(),
      confermaIncerta: input.confermaIncerta,
    })
  ) {
    const recuperabile = puoAcquisireInvio({
      stato: statoLetto,
      lockAtMs: lockValido,
      oraMs: Date.now(),
      confermaIncerta: true,
    });
    if (statoLetto === "in_invio" && !recuperabile) return { tipo: "in_corso" };
    if (statoLetto === "incerta" || statoLetto === "in_invio") {
      return { tipo: "conferma_richiesta" };
    }
    return { tipo: "stato", stato: statoLetto };
  }

  const { data, error } = await supabase.rpc("acquisisci_notifica_distribuzione", {
    p_canale: input.canale,
    p_distribuzione_id: input.distribuzioneId,
    p_conferma_incerta: input.confermaIncerta,
  });
  if (error) return { tipo: "stato", stato: await leggiStato(input.canale, input.distribuzioneId) };
  const acquisita = primaRiga<Acquisizione>(data);
  if (!acquisita?.acquisita || !acquisita.lock_id) {
    const stato = comeStatoNotificaDistribuzione(String(acquisita?.stato ?? ""));
    if (stato === "in_invio") return { tipo: "in_corso" };
    if (stato === "incerta") return { tipo: "conferma_richiesta" };
    return { tipo: "stato", stato };
  }
  const lock = String(acquisita.lock_id);

  const messaggio = await input.messaggio();
  if (!messaggio.to) {
    const chiusa = await concludi({
      canale: input.canale,
      distribuzioneId: input.distribuzioneId,
      lock,
      esito: "fallita",
      errore: "Anagrafica senza un indirizzo email utilizzabile.",
      messageId: null,
    });
    return {
      tipo: "stato",
      stato: chiusa ? "fallita" : await leggiStato(input.canale, input.distribuzioneId),
    };
  }

  try {
    const inviata = await inviaDaCasellaAnagrafica({
      to: messaggio.to,
      subject: messaggio.subject,
      text: messaggio.text,
    });
    const chiusa = await concludi({
      canale: input.canale,
      distribuzioneId: input.distribuzioneId,
      lock,
      esito: "inviata",
      errore: null,
      messageId: inviata.messageId,
    });
    return {
      tipo: "stato",
      stato: chiusa ? "inviata" : await leggiStato(input.canale, input.distribuzioneId),
    };
  } catch (errore) {
    const raw = errore instanceof Error ? errore.message : "Invio non riuscito.";
    const esito = classificaErroreInvio(raw) === "certo" ? "fallita" : "incerta";
    const chiusa = await concludi({
      canale: input.canale,
      distribuzioneId: input.distribuzioneId,
      lock,
      esito,
      errore: testoErroreInvio(errore),
      messageId: null,
    });
    return {
      tipo: "stato",
      stato: chiusa ? esito : await leggiStato(input.canale, input.distribuzioneId),
    };
  }
}
