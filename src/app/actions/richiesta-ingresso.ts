"use server";

import { z } from "zod";
import { writeAuditLog } from "@/lib/audit";
import { inviaDaCasellaAnagrafica } from "@/lib/anagrafica/casella-invio";
import { requireAreaAccess } from "@/lib/areas/guard";
import { primoIndirizzoEmail } from "@/lib/produzione/haccp-versioni";
import {
  etichettaNotificaRichiesta,
  pianoRichiestaIngresso,
  type NotificaRichiestaStato,
} from "@/lib/produzione/richiesta-ingresso";
import { createClient } from "@/lib/supabase/server";

const uuidSchema = z.string().uuid();

type Errore = { success: false; error: string };

export type RichiestaIngressoRiga = {
  richiestaId: string | null;
  foglioId: string;
  codice: string;
  statoFoglio: string;
  createdAt: string;
  disponibileAt: string | null;
  notificaStato: NotificaRichiestaStato | null;
  notificaAt: string | null;
  notificaErrore: string | null;
  legacy: boolean;
};

function comeNotifica(valore: string): NotificaRichiestaStato {
  if (valore === "inviata" || valore === "fallita") return valore;
  return "non_inviata";
}

function messaggioRpc(error: { message?: string } | null): string {
  const testo = error?.message ?? "";
  if (testo.includes("Materia prima")) {
    return "Il fornitore non è idoneo: serve la tipologia Materia prima.";
  }
  if (testo.includes("account attivo")) {
    return "Nessun account attivo collegato a questo fornitore.";
  }
  if (testo.includes("Non autorizzato")) return "Non puoi inviare questa richiesta.";
  if (testo.includes("altro fornitore")) {
    return "Operazione già usata per un altro fornitore.";
  }
  return "Richiesta non registrata.";
}

function testoErroreInvio(errore: unknown): string {
  const testo = errore instanceof Error ? errore.message : "Invio non riuscito.";
  if (testo.includes("@")) return "Invio non riuscito.";
  return testo.slice(0, 400);
}

async function notificaRichiesta(input: {
  richiestaId: string;
  foglioId: string;
  codice: string;
  fornitoreId: string;
  actorId: string;
}): Promise<NotificaRichiestaStato> {
  const supabase = await createClient();
  const { data: attuale } = await supabase
    .from("haccp_richieste_ingresso")
    .select("notifica_stato")
    .eq("id", input.richiestaId)
    .is("deleted_at", null)
    .maybeSingle();
  if (attuale?.notifica_stato === "inviata") return "inviata";

  const { data: fornitore } = await supabase
    .from("fornitori")
    .select("email, ragione_sociale")
    .eq("id", input.fornitoreId)
    .maybeSingle();
  const indirizzo = primoIndirizzoEmail(String(fornitore?.email ?? ""));
  const nome = String(fornitore?.ragione_sociale ?? "fornitore");
  const ora = new Date().toISOString();

  async function chiudi(stato: NotificaRichiestaStato, erroreTesto: string | null) {
    await supabase
      .from("haccp_richieste_ingresso")
      .update({
        notifica_stato: stato,
        notifica_at: stato === "inviata" ? ora : null,
        notifica_errore: erroreTesto,
        updated_by: input.actorId,
      })
      .eq("id", input.richiestaId)
      .neq("notifica_stato", "inviata");
  }

  if (!indirizzo) {
    await chiudi("fallita", "Anagrafica senza un indirizzo email utilizzabile.");
    return "fallita";
  }

  try {
    await inviaDaCasellaAnagrafica({
      to: indirizzo,
      subject: `Materiale in ingresso ${input.codice}`,
      text: [
        `Agrinsicilia ha assegnato il foglio ${input.codice} a ${nome}.`,
        "",
        "Il foglio si apre in Gestionale fornitori, sezione Materiale in ingresso, dopo l'accesso.",
        "Questa mail è solo l'avviso. Non conferma che il messaggio sia stato letto.",
        "Le voci si compilano nel gestionale. Foto, DDT, firme e chiusura non sono attive.",
        "",
        `https://www.opuntiaindustry.com/app/area-fornitori/materiale-in-ingresso?foglio=${input.foglioId}`,
      ].join("\n"),
    });
  } catch (errore) {
    await chiudi("fallita", testoErroreInvio(errore));
    return "fallita";
  }

  await chiudi("inviata", null);
  return "inviata";
}

export async function listaRichiesteIngressoFornitoreAction(
  fornitoreId: string
): Promise<{ success: true; righe: RichiestaIngressoRiga[] } | Errore> {
  const parsed = uuidSchema.safeParse(fornitoreId);
  if (!parsed.success) return { success: false, error: "Fornitore non valido." };
  await requireAreaAccess("amministrazione");
  const supabase = await createClient();
  const [richiesteRes, fogliRes] = await Promise.all([
    supabase
      .from("haccp_richieste_ingresso")
      .select(
        "id, foglio_id, created_at, disponibile_at, notifica_stato, notifica_at, notifica_errore"
      )
      .eq("fornitore_id", parsed.data)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("haccp_fogli_ingresso")
      .select("id, codice, stato, opened_at")
      .eq("fornitore_id", parsed.data)
      .is("deleted_at", null)
      .order("opened_at", { ascending: false }),
  ]);
  if (richiesteRes.error || fogliRes.error) {
    return { success: false, error: "Richieste non disponibili." };
  }
  const fogli = new Map(
    (fogliRes.data ?? []).map((row) => [
      String(row.id),
      {
        codice: String(row.codice),
        stato: String(row.stato),
        openedAt: String(row.opened_at),
      },
    ])
  );
  const usati = new Set<string>();
  const righe: RichiestaIngressoRiga[] = [];
  for (const row of richiesteRes.data ?? []) {
    const foglioId = row.foglio_id ? String(row.foglio_id) : "";
    const foglio = foglioId ? fogli.get(foglioId) : undefined;
    if (!foglio || !foglioId) continue;
    usati.add(foglioId);
    righe.push({
      richiestaId: String(row.id),
      foglioId,
      codice: foglio.codice,
      statoFoglio: foglio.stato,
      createdAt: String(row.created_at),
      disponibileAt: row.disponibile_at ? String(row.disponibile_at) : null,
      notificaStato: comeNotifica(String(row.notifica_stato)),
      notificaAt: row.notifica_at ? String(row.notifica_at) : null,
      notificaErrore: row.notifica_errore ? String(row.notifica_errore) : null,
      legacy: false,
    });
  }
  for (const [foglioId, foglio] of fogli) {
    if (usati.has(foglioId)) continue;
    righe.push({
      richiestaId: null,
      foglioId,
      codice: foglio.codice,
      statoFoglio: foglio.stato,
      createdAt: foglio.openedAt,
      disponibileAt: null,
      notificaStato: null,
      notificaAt: null,
      notificaErrore: null,
      legacy: true,
    });
  }
  return { success: true, righe };
}

export async function creaEInviaRichiestaIngressoAction(raw: unknown): Promise<
  | {
      success: true;
      richiestaId: string;
      foglioId: string;
      codice: string;
      creata: boolean;
      notificaStato: NotificaRichiestaStato;
      notificaEtichetta: string;
    }
  | Errore
> {
  const parsed = z
    .object({ fornitoreId: uuidSchema, chiave: uuidSchema })
    .safeParse(raw);
  if (!parsed.success) return { success: false, error: "Dati non validi." };
  const { auth } = await requireAreaAccess("amministrazione");
  const supabase = await createClient();
  const [fornitoreRes, accessiRes] = await Promise.all([
    supabase
      .from("fornitori")
      .select("id, tipologie")
      .eq("id", parsed.data.fornitoreId)
      .is("deleted_at", null)
      .maybeSingle(),
    supabase
      .from("fornitori_accessi")
      .select("profile_id")
      .eq("fornitore_id", parsed.data.fornitoreId)
      .is("deleted_at", null),
  ]);
  if (fornitoreRes.error || !fornitoreRes.data) {
    return { success: false, error: "Fornitore non trovato." };
  }
  const profili = (accessiRes.data ?? []).map((row) => String(row.profile_id));
  const attiviRes = profili.length
    ? await supabase
        .from("profiles")
        .select("id")
        .in("id", profili)
        .eq("is_active", true)
    : { data: [], error: null };
  if (accessiRes.error || attiviRes.error) {
    return { success: false, error: "Account del fornitore non verificati." };
  }
  const { data: gia } = await supabase
    .from("haccp_richieste_ingresso")
    .select("notifica_stato")
    .eq("chiave_operazione", parsed.data.chiave)
    .is("deleted_at", null)
    .maybeSingle();
  const piano = pianoRichiestaIngresso({
    tipologie: Array.isArray(fornitoreRes.data.tipologie)
      ? fornitoreRes.data.tipologie.map(String)
      : [],
    accountAttivi: (attiviRes.data ?? []).length,
    richiestaEsistente: Boolean(gia),
    notificaStato: gia ? comeNotifica(String(gia.notifica_stato)) : null,
  });
  if (!piano.ok) return { success: false, error: piano.motivo };

  const { data, error } = await supabase.rpc("crea_richiesta_materiale_ingresso", {
    p_fornitore_id: parsed.data.fornitoreId,
    p_chiave: parsed.data.chiave,
  });
  if (error) return { success: false, error: messaggioRpc(error) };
  const righe = (Array.isArray(data) ? data : data ? [data] : []) as Array<{
    richiesta_id: string;
    foglio_id: string;
    codice: string;
    creata: boolean;
  }>;
  const riga = righe[0];
  if (!riga?.foglio_id) return { success: false, error: "Richiesta non registrata." };

  const notificaStato = piano.inviaNotifica
    ? await notificaRichiesta({
        richiestaId: String(riga.richiesta_id),
        foglioId: String(riga.foglio_id),
        codice: String(riga.codice),
        fornitoreId: parsed.data.fornitoreId,
        actorId: auth.userId,
      })
    : "inviata";

  await writeAuditLog({
    entity_type: "haccp_richieste_ingresso",
    entity_id: String(riga.richiesta_id),
    action: riga.creata ? "creazione_invio" : "invio_esistente",
    actor_id: auth.userId,
    summary: `Foglio ${riga.codice}: ${etichettaNotificaRichiesta(notificaStato)}.`,
    payload: {
      foglioId: String(riga.foglio_id),
      codice: String(riga.codice),
      creata: Boolean(riga.creata),
      notificaStato,
    },
  });

  return {
    success: true,
    richiestaId: String(riga.richiesta_id),
    foglioId: String(riga.foglio_id),
    codice: String(riga.codice),
    creata: Boolean(riga.creata),
    notificaStato,
    notificaEtichetta: etichettaNotificaRichiesta(notificaStato),
  };
}

export async function riprovaNotificaRichiestaIngressoAction(
  richiestaId: string
): Promise<
  | { success: true; notificaStato: NotificaRichiestaStato; notificaEtichetta: string }
  | Errore
> {
  const parsed = uuidSchema.safeParse(richiestaId);
  if (!parsed.success) return { success: false, error: "Richiesta non valida." };
  const { auth } = await requireAreaAccess("amministrazione");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("haccp_richieste_ingresso")
    .select("id, fornitore_id, foglio_id, notifica_stato")
    .eq("id", parsed.data)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !data?.foglio_id) {
    return { success: false, error: "Richiesta non disponibile." };
  }
  const { data: foglio } = await supabase
    .from("haccp_fogli_ingresso")
    .select("codice")
    .eq("id", data.foglio_id)
    .maybeSingle();
  const statoAttuale = comeNotifica(String(data.notifica_stato));
  const notificaStato =
    statoAttuale === "inviata"
      ? "inviata"
      : await notificaRichiesta({
          richiestaId: String(data.id),
          foglioId: String(data.foglio_id),
          codice: String(foglio?.codice ?? "Materiale in ingresso"),
          fornitoreId: String(data.fornitore_id),
          actorId: auth.userId,
        });
  await writeAuditLog({
    entity_type: "haccp_richieste_ingresso",
    entity_id: String(data.id),
    action: "riprova_notifica",
    actor_id: auth.userId,
    summary: `Riprova notifica foglio ${String(foglio?.codice ?? "")}: ${etichettaNotificaRichiesta(notificaStato)}.`,
    payload: {
      foglioId: String(data.foglio_id),
      notificaStato,
    },
  });
  return {
    success: true,
    notificaStato,
    notificaEtichetta: etichettaNotificaRichiesta(notificaStato),
  };
}
