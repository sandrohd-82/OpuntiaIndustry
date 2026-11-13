"use server";

import { z } from "zod";
import { writeAuditLog } from "@/lib/audit";
import { requireAreaAccess } from "@/lib/areas/guard";
import { inviaDaCasellaAnagrafica } from "@/lib/anagrafica/casella-invio";
import { soggettoAccessoFornitore } from "@/lib/produzione/fornitore-accesso-server";
import {
  consultaLineeGuidaFornitore,
  destinatariDaRegistrare,
  primoIndirizzoEmail,
  puoModificareDocumentoLineaGuida,
  puoRegistrarePresaVisione,
  type AmbitoLineaGuida,
  type FornitoreDestinatario,
  type GuidaRicevuta,
  type NotificaStatoGuida,
  type PresaVisioneGuida,
  type SezioneLineaGuida,
  type VersioneRicevuta,
} from "@/lib/produzione/haccp-versioni";
import { createClient } from "@/lib/supabase/server";

const uuidSchema = z.string().uuid();

const testoSchema = z.object({
  documentoId: uuidSchema,
  titolo: z.string().trim().min(2).max(160),
  corpo: z.string().trim().min(1).max(20000),
});

const destinatariSchema = z.object({
  documentoId: uuidSchema,
  ambito: z.enum(["interno", "fornitori"]),
  fornitoreIds: z.array(uuidSchema).max(500),
});

type Errore = { success: false; error: string };

function messaggioDb(error: { message?: string } | null, fallback: string): string {
  const testo = error?.message ?? "";
  if (testo.includes("Nessuna bozza")) return "Nessuna bozza da pubblicare.";
  if (testo.includes("Nessuna modifica")) {
    return "Nessuna modifica rispetto alla versione pubblicata.";
  }
  if (
    testo.includes("immutabile") ||
    testo.includes("non si elimina") ||
    testo.includes("non modificabile") ||
    testo.includes("nuova versione") ||
    testo.includes("solo una versione pubblicata")
  ) {
    return "La versione pubblicata non si può modificare.";
  }
  if (testo.includes("Non autorizzato")) return "Non puoi modificare le linee guida.";
  if (testo.includes("duplicate key")) {
    return "Questa versione è già registrata per il fornitore.";
  }
  return fallback;
}

async function richiediRedazione() {
  const { auth } = await requireAreaAccess("produzione");
  const soggetto = await soggettoAccessoFornitore();
  if (!soggetto || !puoModificareDocumentoLineaGuida(soggetto)) {
    return { ok: false as const, error: "Non puoi modificare le linee guida." };
  }
  return { ok: true as const, userId: auth.userId };
}

export async function listHaccpLineeGuidaAction(): Promise<
  | {
      success: true;
      sezioni: SezioneLineaGuida[];
      fornitori: FornitoreDestinatario[];
    }
  | Errore
> {
  const gate = await richiediRedazione();
  if (!gate.ok) return { success: false, error: gate.error };
  const supabase = await createClient();
  const [documentiRes, versioniRes, destinatariRes, distribuzioniRes, preseRes, fornitoriRes] =
    await Promise.all([
      supabase
        .from("haccp_linee_guida")
        .select("id, slug, titolo, ordine, ambito")
        .is("deleted_at", null)
        .order("ordine", { ascending: true }),
      supabase
        .from("haccp_linee_guida_versioni")
        .select("id, documento_id, numero, titolo, corpo, stato, pubblicata_at, pubblicata_by")
        .is("deleted_at", null)
        .order("numero", { ascending: true }),
      supabase
        .from("haccp_linee_guida_destinatari")
        .select("documento_id, fornitore_id")
        .is("deleted_at", null),
      supabase
        .from("haccp_linee_guida_distribuzioni")
        .select(
          "id, documento_id, versione_id, fornitore_id, registrata_at, notifica_stato, notifica_errore, stato"
        )
        .is("deleted_at", null)
        .eq("stato", "registrata"),
      supabase
        .from("haccp_linee_guida_prese_visione")
        .select("versione_id, fornitore_id"),
      supabase
        .from("fornitori")
        .select("id, ragione_sociale, email")
        .is("deleted_at", null)
        .order("ragione_sociale", { ascending: true }),
    ]);
  const errore =
    documentiRes.error ||
    versioniRes.error ||
    destinatariRes.error ||
    distribuzioniRes.error ||
    preseRes.error ||
    fornitoriRes.error;
  if (errore) return { success: false, error: "Linee guida non disponibili." };

  const autori = [
    ...new Set(
      (versioniRes.data ?? [])
        .map((row) => row.pubblicata_by)
        .filter((id): id is string => Boolean(id))
    ),
  ];
  const nomi = new Map<string, string>();
  if (autori.length > 0) {
    const { data: profili } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", autori);
    for (const profilo of profili ?? []) {
      nomi.set(String(profilo.id), String(profilo.full_name || "Operatore"));
    }
  }

  const fornitori = new Map(
    (fornitoriRes.data ?? []).map((row) => [
      String(row.id),
      String(row.ragione_sociale || "Fornitore"),
    ])
  );
  const prese = new Map<string, number>();
  for (const presa of preseRes.data ?? []) {
    const chiave = `${presa.versione_id}:${presa.fornitore_id}`;
    prese.set(chiave, (prese.get(chiave) ?? 0) + 1);
  }
  const numeri = new Map(
    (versioniRes.data ?? []).map((row) => [String(row.id), Number(row.numero) || 0])
  );

  const sezioni: SezioneLineaGuida[] = (documentiRes.data ?? []).map((documento) => {
    const id = String(documento.id);
    return {
      id,
      slug: String(documento.slug),
      titolo: String(documento.titolo),
      ordine: Number(documento.ordine) || 0,
      ambito: (documento.ambito === "fornitori" ? "fornitori" : "interno") as AmbitoLineaGuida,
      destinatariIds: (destinatariRes.data ?? [])
        .filter((row) => String(row.documento_id) === id)
        .map((row) => String(row.fornitore_id)),
      versioni: (versioniRes.data ?? [])
        .filter((row) => String(row.documento_id) === id)
        .map((row) => ({
          id: String(row.id),
          numero: Number(row.numero) || 0,
          titolo: String(row.titolo),
          corpo: String(row.corpo ?? ""),
          stato: row.stato === "pubblicata" ? "pubblicata" as const : "bozza" as const,
          pubblicataAt: row.pubblicata_at ? String(row.pubblicata_at) : null,
          pubblicataDa: row.pubblicata_by
            ? (nomi.get(String(row.pubblicata_by)) ?? "Operatore")
            : null,
        })),
      distribuzioni: (distribuzioniRes.data ?? [])
        .filter((row) => String(row.documento_id) === id)
        .map((row) => ({
          id: String(row.id),
          versioneId: String(row.versione_id),
          versioneNumero: numeri.get(String(row.versione_id)) ?? 0,
          fornitoreId: String(row.fornitore_id),
          ragioneSociale: fornitori.get(String(row.fornitore_id)) ?? "Fornitore",
          registrataAt: String(row.registrata_at),
          notificaStato: String(row.notifica_stato) as NotificaStatoGuida,
          notificaErrore: row.notifica_errore ? String(row.notifica_errore) : null,
          prese: prese.get(`${row.versione_id}:${row.fornitore_id}`) ?? 0,
        })),
    };
  });

  return {
    success: true,
    sezioni,
    fornitori: (fornitoriRes.data ?? []).map((row) => ({
      id: String(row.id),
      ragioneSociale: String(row.ragione_sociale || "Fornitore"),
      email: String(row.email ?? ""),
    })),
  };
}

async function scriviBozza(input: {
  documentoId: string;
  titolo: string;
  corpo: string;
  userId: string;
}): Promise<{ success: true } | Errore> {
  const supabase = await createClient();
  const { data: documento, error: docError } = await supabase
    .from("haccp_linee_guida")
    .select("id")
    .eq("id", input.documentoId)
    .is("deleted_at", null)
    .maybeSingle();
  if (docError || !documento) return { success: false, error: "Documento non trovato." };

  const { data: versioni, error: versioniError } = await supabase
    .from("haccp_linee_guida_versioni")
    .select("id, numero, stato")
    .eq("documento_id", input.documentoId)
    .is("deleted_at", null);
  if (versioniError) return { success: false, error: "Versioni non disponibili." };

  const bozza = (versioni ?? []).find((row) => row.stato === "bozza");
  if (bozza) {
    const { error } = await supabase
      .from("haccp_linee_guida_versioni")
      .update({
        titolo: input.titolo,
        corpo: input.corpo,
        updated_by: input.userId,
      })
      .eq("id", bozza.id)
      .eq("stato", "bozza");
    if (error) return { success: false, error: messaggioDb(error, "Bozza non salvata.") };
    return { success: true };
  }

  const numero =
    (versioni ?? []).reduce((max, row) => Math.max(max, Number(row.numero) || 0), 0) + 1;
  const pubblicata = (versioni ?? []).some((row) => row.stato === "pubblicata");
  const { error } = await supabase.from("haccp_linee_guida_versioni").insert({
    documento_id: input.documentoId,
    numero,
    titolo: input.titolo,
    corpo: input.corpo,
    stato: "bozza",
    created_by: input.userId,
    updated_by: input.userId,
  });
  if (error) return { success: false, error: messaggioDb(error, "Bozza non salvata.") };

  if (!pubblicata) {
    const { error: testataError } = await supabase
      .from("haccp_linee_guida")
      .update({
        titolo: input.titolo,
        corpo: input.corpo,
        stato: "bozza",
        versione: numero,
        updated_by: input.userId,
      })
      .eq("id", input.documentoId);
    if (testataError) {
      return { success: false, error: messaggioDb(testataError, "Bozza non salvata.") };
    }
  }
  return { success: true };
}

export async function salvaBozzaHaccpLineaGuidaAction(
  raw: unknown
): Promise<{ success: true } | Errore> {
  const gate = await richiediRedazione();
  if (!gate.ok) return { success: false, error: gate.error };
  const parsed = testoSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Testo non valido." };
  }
  const salvata = await scriviBozza({ ...parsed.data, userId: gate.userId });
  if (!salvata.success) return salvata;
  await writeAuditLog({
    entity_type: "haccp_linee_guida",
    entity_id: parsed.data.documentoId,
    action: "bozza",
    actor_id: gate.userId,
    summary: `Bozza della linea guida «${parsed.data.titolo}» salvata.`,
    payload: { titolo: parsed.data.titolo },
  });
  return { success: true };
}

export async function creaHaccpLineaGuidaAction(raw: unknown): Promise<
  { success: true } | Errore
> {
  const gate = await richiediRedazione();
  if (!gate.ok) return { success: false, error: gate.error };
  const parsed = z
    .object({
      titolo: z.string().trim().min(2).max(160),
      corpo: z.string().trim().min(1).max(20000),
    })
    .safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Testo non valido." };
  }
  const supabase = await createClient();
  const slugBase =
    parsed.data.titolo
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80) || "sezione";
  const { data: ordineRow } = await supabase
    .from("haccp_linee_guida")
    .select("ordine")
    .is("deleted_at", null)
    .order("ordine", { ascending: false })
    .limit(1)
    .maybeSingle();
  const ordine = Number(ordineRow?.ordine ?? 0) + 1;
  const { data, error } = await supabase
    .from("haccp_linee_guida")
    .insert({
      slug: `${slugBase}-${ordine}`,
      titolo: parsed.data.titolo,
      corpo: parsed.data.corpo,
      ordine,
      versione: 1,
      stato: "bozza",
      ambito: "interno",
      created_by: gate.userId,
      updated_by: gate.userId,
    })
    .select("id")
    .single();
  if (error || !data) return { success: false, error: "Sezione non creata." };
  const { error: versioneError } = await supabase.from("haccp_linee_guida_versioni").insert({
    documento_id: data.id,
    numero: 1,
    titolo: parsed.data.titolo,
    corpo: parsed.data.corpo,
    stato: "bozza",
    created_by: gate.userId,
    updated_by: gate.userId,
  });
  if (versioneError) return { success: false, error: "Bozza iniziale non creata." };
  await writeAuditLog({
    entity_type: "haccp_linee_guida",
    entity_id: String(data.id),
    action: "create",
    actor_id: gate.userId,
    summary: `Linea guida «${parsed.data.titolo}» creata come bozza interna.`,
    payload: { ambito: "interno" },
  });
  return { success: true };
}

async function consegnaNotifica(
  distribuzioneId: string,
  actorId: string
): Promise<"inviata" | "fallita" | "gia_consegnata"> {
  const supabase = await createClient();
  const { data: riga, error } = await supabase
    .from("haccp_linee_guida_distribuzioni")
    .select("id, fornitore_id, versione_id, notifica_stato")
    .eq("id", distribuzioneId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !riga) return "fallita";
  if (riga.notifica_stato === "inviata") return "gia_consegnata";

  const [{ data: versione }, { data: fornitore }] = await Promise.all([
    supabase
      .from("haccp_linee_guida_versioni")
      .select("numero, titolo")
      .eq("id", riga.versione_id)
      .maybeSingle(),
    supabase
      .from("fornitori")
      .select("email, ragione_sociale")
      .eq("id", riga.fornitore_id)
      .maybeSingle(),
  ]);
  const indirizzo = primoIndirizzoEmail(String(fornitore?.email ?? ""));
  const titolo = String(versione?.titolo ?? "Linea guida");
  const numero = Number(versione?.numero) || 0;
  const ora = new Date().toISOString();

  async function chiudi(stato: "inviata" | "fallita", erroreTesto: string | null) {
    await supabase
      .from("haccp_linee_guida_distribuzioni")
      .update({
        notifica_stato: stato,
        notifica_at: stato === "inviata" ? ora : null,
        notifica_errore: erroreTesto,
        updated_by: actorId,
      })
      .eq("id", distribuzioneId)
      .neq("notifica_stato", "inviata");
  }

  if (!indirizzo) {
    await chiudi("fallita", "Anagrafica senza un indirizzo email utilizzabile.");
    return "fallita";
  }

  try {
    await inviaDaCasellaAnagrafica({
      to: indirizzo,
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
    });
  } catch (e) {
    const dettaglio = e instanceof Error ? e.message : "Invio non riuscito.";
    await chiudi("fallita", dettaglio.slice(0, 400));
    return "fallita";
  }

  await chiudi("inviata", null);
  return "inviata";
}

async function avvisaDistribuzioni(
  ids: string[],
  actorId: string
): Promise<{ inviate: number; nonConsegnate: number }> {
  let inviate = 0;
  let nonConsegnate = 0;
  for (const id of ids) {
    const esito = await consegnaNotifica(id, actorId);
    if (esito === "inviata") inviate += 1;
    if (esito === "fallita") nonConsegnate += 1;
  }
  return { inviate, nonConsegnate };
}

export async function pubblicaHaccpLineaGuidaAction(
  raw: unknown
): Promise<
  | { success: true; registrate: number; inviate: number; nonConsegnate: number }
  | Errore
> {
  const gate = await richiediRedazione();
  if (!gate.ok) return { success: false, error: gate.error };
  const parsed = testoSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Testo non valido." };
  }
  const bozza = await scriviBozza({ ...parsed.data, userId: gate.userId });
  if (!bozza.success) return bozza;

  const supabase = await createClient();
  const { data: versioneId, error } = await supabase.rpc("pubblica_haccp_linea_guida", {
    p_documento_id: parsed.data.documentoId,
  });
  if (error || !versioneId) {
    return { success: false, error: messaggioDb(error, "Pubblicazione non riuscita.") };
  }

  const { data: distribuzioni } = await supabase
    .from("haccp_linee_guida_distribuzioni")
    .select("id, notifica_stato")
    .eq("versione_id", versioneId)
    .eq("notifica_stato", "non_inviata")
    .is("deleted_at", null);
  const ids = (distribuzioni ?? []).map((row) => String(row.id));
  const avviso = await avvisaDistribuzioni(ids, gate.userId);
  await writeAuditLog({
    entity_type: "haccp_linee_guida_versioni",
    entity_id: String(versioneId),
    action: "pubblica",
    actor_id: gate.userId,
    summary: `Linea guida «${parsed.data.titolo}» pubblicata.`,
    payload: {
      documentoId: parsed.data.documentoId,
      registrate: ids.length,
      inviate: avviso.inviate,
      nonConsegnate: avviso.nonConsegnate,
    },
  });
  return { success: true, registrate: ids.length, ...avviso };
}

export async function salvaDestinatariHaccpLineaGuidaAction(
  raw: unknown
): Promise<
  | { success: true; registrate: number; inviate: number; nonConsegnate: number }
  | Errore
> {
  const gate = await richiediRedazione();
  if (!gate.ok) return { success: false, error: gate.error };
  const parsed = destinatariSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Destinatari non validi." };
  }
  const supabase = await createClient();
  const desiderati =
    parsed.data.ambito === "fornitori" ? [...new Set(parsed.data.fornitoreIds)] : [];
  if (desiderati.length > 0) {
    const { data: esistenti, error: fornitoriError } = await supabase
      .from("fornitori")
      .select("id")
      .in("id", desiderati)
      .is("deleted_at", null);
    if (fornitoriError) return { success: false, error: "Fornitori non verificabili." };
    if ((esistenti ?? []).length !== desiderati.length) {
      return { success: false, error: "Uno dei fornitori non è disponibile." };
    }
  }

  const { error: ambitoError } = await supabase
    .from("haccp_linee_guida")
    .update({ ambito: parsed.data.ambito, updated_by: gate.userId })
    .eq("id", parsed.data.documentoId)
    .is("deleted_at", null);
  if (ambitoError) return { success: false, error: "Ambito non salvato." };

  const { data: attivi, error: attiviError } = await supabase
    .from("haccp_linee_guida_destinatari")
    .select("id, fornitore_id")
    .eq("documento_id", parsed.data.documentoId)
    .is("deleted_at", null);
  if (attiviError) return { success: false, error: "Destinatari non disponibili." };

  const desiderato = new Set(desiderati);
  const ora = new Date().toISOString();
  for (const riga of attivi ?? []) {
    if (desiderato.has(String(riga.fornitore_id))) continue;
    const { error } = await supabase
      .from("haccp_linee_guida_destinatari")
      .update({
        deleted_at: ora,
        deleted_by: gate.userId,
        updated_by: gate.userId,
      })
      .eq("id", riga.id);
    if (error) return { success: false, error: "Destinatario non revocato." };
  }
  const gia = new Set((attivi ?? []).map((riga) => String(riga.fornitore_id)));
  for (const fornitoreId of desiderati) {
    if (gia.has(fornitoreId)) continue;
    const { error } = await supabase.from("haccp_linee_guida_destinatari").insert({
      documento_id: parsed.data.documentoId,
      fornitore_id: fornitoreId,
      created_by: gate.userId,
      updated_by: gate.userId,
    });
    if (error) return { success: false, error: messaggioDb(error, "Destinatario non aggiunto.") };
  }

  const { data: pubblicata } = await supabase
    .from("haccp_linee_guida_versioni")
    .select("id")
    .eq("documento_id", parsed.data.documentoId)
    .eq("stato", "pubblicata")
    .is("deleted_at", null)
    .order("numero", { ascending: false })
    .limit(1)
    .maybeSingle();

  let registrate = 0;
  let inviate = 0;
  let nonConsegnate = 0;
  if (pubblicata && parsed.data.ambito === "fornitori") {
    const { data: giaDistribuiti } = await supabase
      .from("haccp_linee_guida_distribuzioni")
      .select("fornitore_id")
      .eq("versione_id", pubblicata.id)
      .is("deleted_at", null);
    const nuovi = destinatariDaRegistrare(
      desiderati,
      (giaDistribuiti ?? []).map((row) => String(row.fornitore_id))
    );
    const creati: string[] = [];
    for (const fornitoreId of nuovi) {
      const { data, error } = await supabase
        .from("haccp_linee_guida_distribuzioni")
        .insert({
          documento_id: parsed.data.documentoId,
          versione_id: pubblicata.id,
          fornitore_id: fornitoreId,
          stato: "registrata",
          notifica_stato: "non_inviata",
          created_by: gate.userId,
          updated_by: gate.userId,
        })
        .select("id")
        .single();
      if (error) {
        if (!String(error.message).includes("duplicate key")) {
          return { success: false, error: messaggioDb(error, "Distribuzione non registrata.") };
        }
        continue;
      }
      creati.push(String(data.id));
    }
    const avviso = await avvisaDistribuzioni(creati, gate.userId);
    registrate = creati.length;
    inviate = avviso.inviate;
    nonConsegnate = avviso.nonConsegnate;
  }

  await writeAuditLog({
    entity_type: "haccp_linee_guida",
    entity_id: parsed.data.documentoId,
    action: "destinatari",
    actor_id: gate.userId,
    summary: `Destinatari della linea guida aggiornati: ${parsed.data.ambito}.`,
    payload: {
      ambito: parsed.data.ambito,
      fornitori: desiderati.length,
      registrate,
      inviate,
      nonConsegnate,
    },
  });
  return { success: true, registrate, inviate, nonConsegnate };
}

export async function riprovaNotificaHaccpLineaGuidaAction(
  distribuzioneId: string
): Promise<{ success: true; consegnata: boolean } | Errore> {
  const gate = await richiediRedazione();
  if (!gate.ok) return { success: false, error: gate.error };
  const parsed = uuidSchema.safeParse(distribuzioneId);
  if (!parsed.success) return { success: false, error: "Distribuzione non valida." };
  const esito = await consegnaNotifica(parsed.data, gate.userId);
  if (esito === "fallita") {
    return { success: false, error: "La notifica non è stata consegnata. La distribuzione resta registrata." };
  }
  return { success: true, consegnata: esito === "inviata" || esito === "gia_consegnata" };
}

export async function listLineeGuidaRicevuteAction(): Promise<
  { success: true; guide: GuidaRicevuta[] } | Errore
> {
  const { auth } = await requireAreaAccess("area-fornitori");
  const soggetto = await soggettoAccessoFornitore();
  if (!soggetto) return { success: false, error: "Accesso richiesto." };
  const consulta = consultaLineeGuidaFornitore(soggetto);
  if (!consulta.ok) {
    return {
      success: false,
      error:
        consulta.motivo === "non_collegato"
          ? "Il tuo utente non è collegato a un fornitore. Qui compaiono solo i documenti della tua azienda."
          : "Accesso non consentito.",
    };
  }

  const supabase = await createClient();
  const { data: distribuzioni, error } = await supabase
    .from("haccp_linee_guida_distribuzioni")
    .select("id, documento_id, versione_id, fornitore_id, registrata_at, notifica_stato")
    .eq("fornitore_id", consulta.fornitoreId)
    .eq("stato", "registrata")
    .is("deleted_at", null)
    .order("registrata_at", { ascending: false });
  if (error) return { success: false, error: "Documenti non disponibili." };
  if ((distribuzioni ?? []).length === 0) return { success: true, guide: [] };

  const versioneIds = [...new Set((distribuzioni ?? []).map((row) => String(row.versione_id)))];
  const [{ data: versioni, error: versioniError }, { data: prese, error: preseError }] =
    await Promise.all([
      supabase
        .from("haccp_linee_guida_versioni")
        .select("id, documento_id, numero, titolo, corpo, pubblicata_at, stato")
        .in("id", versioneIds)
        .eq("stato", "pubblicata"),
      supabase
        .from("haccp_linee_guida_prese_visione")
        .select("versione_id, profile_id, confermata_at, fornitore_id")
        .eq("fornitore_id", consulta.fornitoreId),
    ]);
  if (versioniError || preseError) return { success: false, error: "Versioni non disponibili." };

  const profiliIds = [...new Set((prese ?? []).map((row) => String(row.profile_id)))];
  const nomi = new Map<string, string>();
  if (profiliIds.length > 0) {
    const { data: profili } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", profiliIds);
    for (const profilo of profili ?? []) {
      nomi.set(String(profilo.id), String(profilo.full_name || "Utente"));
    }
  }

  const mioId = auth.userId;
  const perDocumento = new Map<string, VersioneRicevuta[]>();
  const versioniPerId = new Map((versioni ?? []).map((row) => [String(row.id), row]));
  for (const distribuzione of distribuzioni ?? []) {
    if (String(distribuzione.fornitore_id) !== consulta.fornitoreId) continue;
    const versione = versioniPerId.get(String(distribuzione.versione_id));
    if (!versione || versione.stato !== "pubblicata") continue;
    const preseVersione = (prese ?? []).filter(
      (presa) =>
        String(presa.versione_id) === String(versione.id) &&
        String(presa.fornitore_id) === consulta.fornitoreId
    );
    const mia = preseVersione.find((presa) => String(presa.profile_id) === mioId);
    const voce: VersioneRicevuta = {
      id: String(versione.id),
      numero: Number(versione.numero) || 0,
      titolo: String(versione.titolo),
      corpo: String(versione.corpo ?? ""),
      pubblicataAt: versione.pubblicata_at ? String(versione.pubblicata_at) : null,
      registrataAt: String(distribuzione.registrata_at),
      notificaStato: String(distribuzione.notifica_stato) as NotificaStatoGuida,
      miaPresaAt: mia ? String(mia.confermata_at) : null,
      preseAzienda: preseVersione.map(
        (presa): PresaVisioneGuida => ({
          profileId: String(presa.profile_id),
          nome: nomi.get(String(presa.profile_id)) ?? "Utente",
          confermataAt: String(presa.confermata_at),
        })
      ),
    };
    const lista = perDocumento.get(String(versione.documento_id)) ?? [];
    lista.push(voce);
    perDocumento.set(String(versione.documento_id), lista);
  }

  const guide: GuidaRicevuta[] = [...perDocumento.entries()].map(([documentoId, versioniDoc]) => {
    const ordinate = [...versioniDoc].sort((a, b) => b.numero - a.numero);
    return {
      documentoId,
      titolo: ordinate[0]?.titolo ?? "Linea guida",
      versioni: ordinate,
    };
  });
  return { success: true, guide };
}

export async function confermaPresaVisioneHaccpAction(
  raw: unknown
): Promise<{ success: true; giaConfermata: boolean } | Errore> {
  const { auth } = await requireAreaAccess("area-fornitori");
  const soggetto = await soggettoAccessoFornitore();
  if (!soggetto) return { success: false, error: "Accesso richiesto." };
  const consulta = consultaLineeGuidaFornitore(soggetto);
  if (!consulta.ok) {
    return { success: false, error: "Presa visione non consentita per questo utente." };
  }
  const parsed = z.object({ versioneId: uuidSchema }).safeParse(raw);
  if (!parsed.success) return { success: false, error: "Versione non valida." };

  const supabase = await createClient();
  const { data: distribuzione } = await supabase
    .from("haccp_linee_guida_distribuzioni")
    .select("documento_id, fornitore_id, versione_id")
    .eq("versione_id", parsed.data.versioneId)
    .eq("fornitore_id", consulta.fornitoreId)
    .eq("stato", "registrata")
    .is("deleted_at", null)
    .maybeSingle();
  const { data: gia } = await supabase
    .from("haccp_linee_guida_prese_visione")
    .select("id")
    .eq("versione_id", parsed.data.versioneId)
    .eq("profile_id", auth.userId)
    .maybeSingle();
  const decisione = puoRegistrarePresaVisione({
    fornitoreSessione: consulta.fornitoreId,
    versioneDistribuita: Boolean(
      distribuzione && String(distribuzione.fornitore_id) === consulta.fornitoreId
    ),
    giaConfermataDaQuestoUtente: Boolean(gia),
  });
  if (!decisione.ok || !distribuzione) {
    if (decisione.ok) {
      return { success: false, error: "Questa versione non è stata distribuita alla tua azienda." };
    }
    if (decisione.motivo === "gia_confermata") {
      return { success: true, giaConfermata: true };
    }
    if (decisione.motivo === "versione_non_ricevuta") {
      return { success: false, error: "Questa versione non è stata distribuita alla tua azienda." };
    }
    return { success: false, error: "Presa visione non consentita." };
  }

  const { data, error } = await supabase
    .from("haccp_linee_guida_prese_visione")
    .insert({
      fornitore_id: consulta.fornitoreId,
      profile_id: auth.userId,
      documento_id: distribuzione.documento_id,
      versione_id: parsed.data.versioneId,
      created_by: auth.userId,
      updated_by: auth.userId,
    })
    .select("id")
    .single();
  if (error || !data) {
    if (String(error?.message ?? "").includes("duplicate key")) {
      return { success: true, giaConfermata: true };
    }
    return { success: false, error: "Presa visione non registrata." };
  }
  await writeAuditLog({
    entity_type: "haccp_linee_guida_prese_visione",
    entity_id: String(data.id),
    action: "presa_visione",
    actor_id: auth.userId,
    summary: "Presa visione registrata sulla versione ricevuta.",
    payload: {
      fornitoreId: consulta.fornitoreId,
      versioneId: parsed.data.versioneId,
      documentoId: String(distribuzione.documento_id),
    },
  });
  return { success: true, giaConfermata: false };
}
