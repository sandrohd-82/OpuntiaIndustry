"use server";

import { z } from "zod";
import { writeAuditLog } from "@/lib/audit";
import {
  comeStatoNotificaDistribuzione,
  MESSAGGIO_CONFERMA_INCERTA,
} from "@/lib/produzione/notifica-distribuzione";
import {
  eseguiNotificaDistribuzione,
  messaggioDistribuzioneHaccp,
  messaggioDistribuzioneTesto,
} from "@/lib/produzione/notifica-distribuzione-invio";
import type { NotificaRichiestaStato } from "@/lib/produzione/richiesta-ingresso";
import { requireAreaAccess } from "@/lib/areas/guard";
import {
  attoCopreNatura,
  etichettaNaturaRequisito,
  etichettaStatoAbilitazione,
  requisitiApplicabili,
  requisitoSoddisfatto,
  sospesoDaEventi,
  tipologiaFornitoreValida,
  valutaAbilitazione,
  type EccezioneRequisito,
  type NaturaRequisito,
  type RequisitoCatalogo,
  type StatoAbilitazioneFornitore,
  type VoceAbilitazione,
} from "@/lib/amministrazione/requisiti-fornitore";
import { consultaLineeGuidaFornitore } from "@/lib/produzione/haccp-versioni";
import { soggettoAccessoFornitore } from "@/lib/produzione/fornitore-accesso-server";
import { createClient } from "@/lib/supabase/server";

const uuidSchema = z.string().uuid();
const naturaSchema = z.enum([
  "presa_visione",
  "consenso_privacy",
  "accettazione_contrattuale",
  "controllo_interno",
]);

type Errore = { success: false; error: string };

export type RequisitoSchedaRiga = {
  id: string;
  codice: string;
  titolo: string;
  natura: NaturaRequisito;
  applicabile: boolean;
  eccezione: "aggiunto" | "escluso" | null;
  soddisfatto: boolean;
  dettaglio: string;
  validitaGiorni: number | null;
  lineaGuidaId: string | null;
  testoId: string | null;
  bozzaTitolo: string | null;
  bozzaCorpo: string | null;
  versionePubblicataId: string | null;
  notificaStato: NotificaRichiestaStato | null;
  notificaLockAt: string | null;
  notificaErrore: string | null;
  distribuzioneId: string | null;
};

export type SchedaAbilitazione = {
  stato: StatoAbilitazioneFornitore;
  etichetta: string;
  sospeso: boolean;
  righe: RequisitoSchedaRiga[];
  guide: { id: string; titolo: string }[];
  eventi: { tipo: "sospensione" | "riabilitazione"; motivo: string; at: string }[];
};

function comeNotifica(valore: string | undefined): NotificaRichiestaStato | null {
  if (!valore) return null;
  return comeStatoNotificaDistribuzione(valore);
}

function comeNatura(valore: string): NaturaRequisito {
  if (
    valore === "presa_visione" ||
    valore === "consenso_privacy" ||
    valore === "accettazione_contrattuale" ||
    valore === "controllo_interno"
  ) {
    return valore;
  }
  return "presa_visione";
}

async function richiediAmministrazione() {
  const { auth } = await requireAreaAccess("amministrazione");
  return auth;
}

export async function listaAbilitazioneFornitoreAction(
  fornitoreId: string
): Promise<{ success: true; scheda: SchedaAbilitazione } | Errore> {
  const parsed = uuidSchema.safeParse(fornitoreId);
  if (!parsed.success) return { success: false, error: "Fornitore non valido." };
  await richiediAmministrazione();
  const supabase = await createClient();
  const { data: fornitore, error: fornitoreError } = await supabase
    .from("fornitori")
    .select("id, tipologie")
    .eq("id", parsed.data)
    .is("deleted_at", null)
    .maybeSingle();
  if (fornitoreError || !fornitore) return { success: false, error: "Fornitore non trovato." };

  const [requisitiRes, tipologieRes, eccezioniRes, eventiRes, guideRes] = await Promise.all([
    supabase
      .from("fornitori_requisiti")
      .select("id, codice, titolo, natura, linea_guida_id, validita_giorni")
      .is("deleted_at", null)
      .order("codice", { ascending: true }),
    supabase.from("fornitori_requisiti_tipologie").select("requisito_id, tipologia"),
    supabase
      .from("fornitori_requisiti_eccezioni")
      .select("requisito_id, modalita")
      .eq("fornitore_id", parsed.data)
      .is("deleted_at", null),
    supabase
      .from("fornitori_abilitazione_eventi")
      .select("tipo, motivo, created_at")
      .eq("fornitore_id", parsed.data)
      .order("created_at", { ascending: false })
      .limit(8),
    supabase
      .from("haccp_linee_guida")
      .select("id, titolo")
      .is("deleted_at", null)
      .order("titolo", { ascending: true }),
  ]);
  if (
    requisitiRes.error ||
    tipologieRes.error ||
    eccezioniRes.error ||
    eventiRes.error ||
    guideRes.error
  ) {
    return { success: false, error: "Requisiti non disponibili." };
  }

  const tipiPerRequisito = new Map<string, RequisitoCatalogo["tipologie"][number][]>();
  for (const row of tipologieRes.data ?? []) {
    const id = String(row.requisito_id);
    const tipo = String(row.tipologia);
    if (!tipologiaFornitoreValida(tipo)) continue;
    const lista = tipiPerRequisito.get(id) ?? [];
    lista.push(tipo);
    tipiPerRequisito.set(id, lista);
  }
  const catalogo: RequisitoCatalogo[] = (requisitiRes.data ?? []).map((row) => ({
    id: String(row.id),
    natura: comeNatura(String(row.natura)),
    tipologie: tipiPerRequisito.get(String(row.id)) ?? [],
    validitaGiorni: row.validita_giorni == null ? null : Number(row.validita_giorni),
  }));
  const eccezioni: EccezioneRequisito[] = (eccezioniRes.data ?? []).map((row) => ({
    requisitoId: String(row.requisito_id),
    modalita: row.modalita === "escluso" ? "escluso" : "aggiunto",
  }));
  const applicabili = new Set(
    requisitiApplicabili({
      tipologieFornitore: Array.isArray(fornitore.tipologie)
        ? fornitore.tipologie.map(String)
        : [],
      catalogo,
      eccezioni,
    }).map((requisito) => requisito.id)
  );
  const eccezioneMap = new Map(eccezioni.map((riga) => [riga.requisitoId, riga.modalita]));

  const lineaIds = [
    ...new Set(
      (requisitiRes.data ?? [])
        .map((row) => (row.linea_guida_id ? String(row.linea_guida_id) : ""))
        .filter(Boolean)
    ),
  ];
  const requisitoIds = catalogo.map((requisito) => requisito.id);
  const [versioniGuidaRes, distribuzioniGuidaRes, preseRes, testiRes, controlliRes] =
    await Promise.all([
      lineaIds.length
        ? supabase
            .from("haccp_linee_guida_versioni")
            .select("id, documento_id, numero")
            .in("documento_id", lineaIds)
            .eq("stato", "pubblicata")
            .is("deleted_at", null)
            .order("numero", { ascending: false })
        : Promise.resolve({ data: [], error: null }),
      lineaIds.length
        ? supabase
            .from("haccp_linee_guida_distribuzioni")
            .select("id, documento_id, versione_id, notifica_stato, notifica_lock_at, notifica_errore")
            .eq("fornitore_id", parsed.data)
            .in("documento_id", lineaIds)
            .eq("stato", "registrata")
            .is("deleted_at", null)
        : Promise.resolve({ data: [], error: null }),
      lineaIds.length
        ? supabase
            .from("haccp_linee_guida_prese_visione")
            .select("versione_id, confermata_at")
            .eq("fornitore_id", parsed.data)
            .order("confermata_at", { ascending: false })
        : Promise.resolve({ data: [], error: null }),
      requisitoIds.length
        ? supabase
            .from("fornitori_testi_abilitazione")
            .select("id, requisito_id")
            .in("requisito_id", requisitoIds)
            .is("deleted_at", null)
        : Promise.resolve({ data: [], error: null }),
      requisitoIds.length
        ? supabase
            .from("fornitori_controlli_interni")
            .select("requisito_id, esito, registrata_at")
            .eq("fornitore_id", parsed.data)
            .in("requisito_id", requisitoIds)
            .order("registrata_at", { ascending: false })
        : Promise.resolve({ data: [], error: null }),
    ]);
  if (
    versioniGuidaRes.error ||
    distribuzioniGuidaRes.error ||
    preseRes.error ||
    testiRes.error ||
    controlliRes.error
  ) {
    return { success: false, error: "Stato dei requisiti non disponibile." };
  }

  const testoIds = (testiRes.data ?? []).map((row) => String(row.id));
  const [versioniTestoRes, distribuzioniTestoRes, attiRes] = await Promise.all([
    testoIds.length
      ? supabase
          .from("fornitori_testi_versioni")
          .select("id, testo_id, numero, stato, titolo, corpo")
          .in("testo_id", testoIds)
          .is("deleted_at", null)
          .order("numero", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    testoIds.length
      ? supabase
          .from("fornitori_testi_distribuzioni")
          .select("id, testo_id, versione_id, notifica_stato, notifica_lock_at, notifica_errore")
          .eq("fornitore_id", parsed.data)
          .in("testo_id", testoIds)
          .is("deleted_at", null)
      : Promise.resolve({ data: [], error: null }),
    testoIds.length
      ? supabase
          .from("fornitori_testi_atti")
          .select("versione_id, atto, confermata_at")
          .eq("fornitore_id", parsed.data)
          .order("confermata_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (versioniTestoRes.error || distribuzioniTestoRes.error || attiRes.error) {
    return { success: false, error: "Testi di abilitazione non disponibili." };
  }

  const ultimaGuida = new Map<string, { id: string; numero: number }>();
  for (const row of versioniGuidaRes.data ?? []) {
    const documentoId = String(row.documento_id);
    if (!ultimaGuida.has(documentoId)) {
      ultimaGuida.set(documentoId, { id: String(row.id), numero: Number(row.numero) });
    }
  }
  const distribuzioneGuida = new Map<
    string,
    { id: string; versioneId: string; notifica: string; lockAt: string | null; errore: string | null }
  >();
  for (const row of distribuzioniGuidaRes.data ?? []) {
    const documentoId = String(row.documento_id);
    const corrente = ultimaGuida.get(documentoId);
    if (!corrente || String(row.versione_id) !== corrente.id) continue;
    if (!distribuzioneGuida.has(documentoId)) {
      distribuzioneGuida.set(documentoId, {
        id: String(row.id),
        versioneId: String(row.versione_id),
        notifica: String(row.notifica_stato),
        lockAt: row.notifica_lock_at ? String(row.notifica_lock_at) : null,
        errore: row.notifica_errore ? String(row.notifica_errore) : null,
      });
    }
  }
  const presaPerVersione = new Map<string, string>();
  for (const row of preseRes.data ?? []) {
    const versioneId = String(row.versione_id);
    if (!presaPerVersione.has(versioneId)) {
      presaPerVersione.set(versioneId, String(row.confermata_at));
    }
  }
  const testoPerRequisito = new Map(
    (testiRes.data ?? []).map((row) => [String(row.requisito_id), String(row.id)])
  );
  const ultimaTesto = new Map<string, { id: string; numero: number }>();
  const bozzaPerTesto = new Map<string, { titolo: string; corpo: string }>();
  for (const row of versioniTestoRes.data ?? []) {
    if (String(row.stato) === "bozza") {
      const testoId = String(row.testo_id);
      if (!bozzaPerTesto.has(testoId)) {
        bozzaPerTesto.set(testoId, {
          titolo: String(row.titolo ?? ""),
          corpo: String(row.corpo ?? ""),
        });
      }
    }
    if (String(row.stato) !== "pubblicata") continue;
    const testoId = String(row.testo_id);
    if (!ultimaTesto.has(testoId)) {
      ultimaTesto.set(testoId, { id: String(row.id), numero: Number(row.numero) });
    }
  }
  const distribuzioneTesto = new Map<
    string,
    { id: string; versioneId: string; notifica: string; lockAt: string | null; errore: string | null }
  >();
  for (const row of distribuzioniTestoRes.data ?? []) {
    const testoId = String(row.testo_id);
    const corrente = ultimaTesto.get(testoId);
    if (!corrente || String(row.versione_id) !== corrente.id) continue;
    distribuzioneTesto.set(testoId, {
      id: String(row.id),
      versioneId: String(row.versione_id),
      notifica: String(row.notifica_stato),
      lockAt: row.notifica_lock_at ? String(row.notifica_lock_at) : null,
      errore: row.notifica_errore ? String(row.notifica_errore) : null,
    });
  }
  const attoPerVersione = new Map<string, { atto: string; at: string }>();
  for (const row of attiRes.data ?? []) {
    const versioneId = String(row.versione_id);
    if (!attoPerVersione.has(versioneId)) {
      attoPerVersione.set(versioneId, {
        atto: String(row.atto),
        at: String(row.confermata_at),
      });
    }
  }
  const controlloPerRequisito = new Map<string, { esito: "conforme" | "non_conforme"; at: string }>();
  for (const row of controlliRes.data ?? []) {
    const id = String(row.requisito_id);
    if (!controlloPerRequisito.has(id)) {
      controlloPerRequisito.set(id, {
        esito: row.esito === "conforme" ? "conforme" : "non_conforme",
        at: String(row.registrata_at),
      });
    }
  }

  const oraIso = new Date().toISOString();
  const eventi = (eventiRes.data ?? []).map((row) => ({
    tipo: (row.tipo === "sospensione" ? "sospensione" : "riabilitazione") as
      | "sospensione"
      | "riabilitazione",
    motivo: String(row.motivo),
    at: String(row.created_at),
  }));
  const sospeso = sospesoDaEventi(eventi);
  const voci: VoceAbilitazione[] = [];
  const righe: RequisitoSchedaRiga[] = [];

  for (const row of requisitiRes.data ?? []) {
    const id = String(row.id);
    const natura = comeNatura(String(row.natura));
    const applicabile = applicabili.has(id);
    const validitaGiorni = row.validita_giorni == null ? null : Number(row.validita_giorni);
    const lineaGuidaId = row.linea_guida_id ? String(row.linea_guida_id) : null;
    const testoId = testoPerRequisito.get(id) ?? null;
    let versioneRichiestaId: string | null = null;
    let distribuita = false;
    let versioneSoddisfattaId: string | null = null;
    let soddisfattoAt: string | null = null;
    let notificaStato: RequisitoSchedaRiga["notificaStato"] = null;
    let notificaLockAt: string | null = null;
    let notificaErrore: string | null = null;
    let distribuzioneId: string | null = null;
    if (natura === "presa_visione" && lineaGuidaId) {
      const pubblicata = ultimaGuida.get(lineaGuidaId);
      versioneRichiestaId = pubblicata?.id ?? null;
      const distribuzione = distribuzioneGuida.get(lineaGuidaId);
      distribuita = Boolean(distribuzione && distribuzione.versioneId === versioneRichiestaId);
      distribuzioneId = distribuzione?.id ?? null;
      notificaStato = comeNotifica(distribuzione?.notifica);
      notificaLockAt = distribuzione?.lockAt ?? null;
      notificaErrore = distribuzione?.errore ?? null;
      if (versioneRichiestaId && presaPerVersione.has(versioneRichiestaId)) {
        versioneSoddisfattaId = versioneRichiestaId;
        soddisfattoAt = presaPerVersione.get(versioneRichiestaId) ?? null;
      }
    }
    if (natura === "consenso_privacy" || natura === "accettazione_contrattuale") {
      const pubblicata = testoId ? ultimaTesto.get(testoId) : undefined;
      versioneRichiestaId = pubblicata?.id ?? null;
      const distribuzione = testoId ? distribuzioneTesto.get(testoId) : undefined;
      distribuita = Boolean(distribuzione && distribuzione.versioneId === versioneRichiestaId);
      distribuzioneId = distribuzione?.id ?? null;
      notificaStato = comeNotifica(distribuzione?.notifica);
      notificaLockAt = distribuzione?.lockAt ?? null;
      notificaErrore = distribuzione?.errore ?? null;
      const atto = versioneRichiestaId ? attoPerVersione.get(versioneRichiestaId) : undefined;
      if (atto && attoCopreNatura(comeNatura(atto.atto), natura)) {
        versioneSoddisfattaId = versioneRichiestaId;
        soddisfattoAt = atto.at;
      }
    }
    const controllo = controlloPerRequisito.get(id);
    const voce: VoceAbilitazione = {
      id,
      natura,
      validitaGiorni,
      versioneRichiestaId,
      distribuita,
      versioneSoddisfattaId,
      soddisfattoAt,
      controlloEsito: controllo?.esito ?? null,
      controlloAt: controllo?.at ?? null,
    };
    if (applicabile) voci.push(voce);
    const soddisfatto = applicabile && requisitoSoddisfatto(voce, oraIso);
    righe.push({
      id,
      codice: String(row.codice),
      titolo: String(row.titolo),
      natura,
      applicabile,
      eccezione: eccezioneMap.get(id) ?? null,
      soddisfatto,
      dettaglio: dettaglioRequisito(voce, applicabile, oraIso),
      validitaGiorni,
      lineaGuidaId,
      testoId,
      bozzaTitolo: testoId ? (bozzaPerTesto.get(testoId)?.titolo ?? null) : null,
      bozzaCorpo: testoId ? (bozzaPerTesto.get(testoId)?.corpo ?? null) : null,
      versionePubblicataId: versioneRichiestaId,
      notificaStato,
      notificaLockAt,
      notificaErrore,
      distribuzioneId,
    });
  }

  const esito = valutaAbilitazione({ oraIso, sospeso, voci });
  return {
    success: true,
    scheda: {
      stato: esito.stato,
      etichetta: etichettaStatoAbilitazione(esito.stato),
      sospeso,
      righe,
      guide: (guideRes.data ?? []).map((row) => ({
        id: String(row.id),
        titolo: String(row.titolo),
      })),
      eventi,
    },
  };
}

function dettaglioRequisito(
  voce: VoceAbilitazione,
  applicabile: boolean,
  oraIso: string
): string {
  if (!applicabile) return "Non applicabile a questa anagrafica.";
  if (requisitoSoddisfatto(voce, oraIso)) {
    return voce.natura === "controllo_interno"
      ? "Controllo interno conforme."
      : "Requisito soddisfatto sulla versione corrente.";
  }
  if (voce.natura === "controllo_interno") {
    return voce.controlloEsito === "non_conforme"
      ? "Ultimo controllo interno non conforme."
      : "Controllo interno mancante.";
  }
  if (!voce.versioneRichiestaId) return "Nessuna versione pubblicata.";
  if (!voce.distribuita) return "Versione pubblicata non ancora distribuita a questo fornitore.";
  if (voce.versioneSoddisfattaId !== voce.versioneRichiestaId) {
    return "La versione corrente non ha ancora una conferma.";
  }
  return "La conferma della versione corrente è scaduta.";
}

export async function creaRequisitoFornitoreAction(
  raw: unknown
): Promise<{ success: true; id: string } | Errore> {
  const parsed = z
    .object({
      codice: z.string().trim().min(2).max(40).regex(/^[a-z0-9-]+$/),
      titolo: z.string().trim().min(2).max(160),
      natura: naturaSchema,
      tipologie: z.array(z.enum(["servizio", "prodotto", "materia_prima", "contributo"])).max(4),
      validitaGiorni: z.number().int().positive().max(3650).nullable(),
      lineaGuidaId: uuidSchema.nullable(),
      corpo: z.string().trim().max(20000).optional(),
    })
    .safeParse(raw);
  if (!parsed.success) return { success: false, error: "Requisito non valido." };
  if (parsed.data.natura === "presa_visione" && !parsed.data.lineaGuidaId) {
    return { success: false, error: "La presa visione deve puntare a una linea guida esistente." };
  }
  if (parsed.data.natura !== "presa_visione" && parsed.data.lineaGuidaId) {
    return { success: false, error: "Solo la presa visione usa una linea guida." };
  }
  const auth = await richiediAmministrazione();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("fornitori_requisiti")
    .insert({
      codice: parsed.data.codice,
      titolo: parsed.data.titolo,
      natura: parsed.data.natura,
      linea_guida_id: parsed.data.lineaGuidaId,
      validita_giorni: parsed.data.validitaGiorni,
      created_by: auth.userId,
      updated_by: auth.userId,
    })
    .select("id")
    .single();
  if (error || !data) return { success: false, error: "Requisito non creato." };
  if (parsed.data.tipologie.length) {
    const { error: tipiError } = await supabase.from("fornitori_requisiti_tipologie").insert(
      parsed.data.tipologie.map((tipologia) => ({
        requisito_id: data.id,
        tipologia,
      }))
    );
    if (tipiError) return { success: false, error: "Tipologie non registrate." };
  }
  if (
    parsed.data.natura === "consenso_privacy" ||
    parsed.data.natura === "accettazione_contrattuale"
  ) {
    const { data: testo, error: testoError } = await supabase
      .from("fornitori_testi_abilitazione")
      .insert({
        requisito_id: data.id,
        created_by: auth.userId,
        updated_by: auth.userId,
      })
      .select("id")
      .single();
    if (testoError || !testo) return { success: false, error: "Testo non creato." };
    const { error: versioneError } = await supabase.from("fornitori_testi_versioni").insert({
      testo_id: testo.id,
      numero: 1,
      titolo: parsed.data.titolo,
      corpo: parsed.data.corpo ?? "",
      stato: "bozza",
      created_by: auth.userId,
      updated_by: auth.userId,
    });
    if (versioneError) return { success: false, error: "Bozza non creata." };
  }
  await writeAuditLog({
    entity_type: "fornitori_requisiti",
    entity_id: String(data.id),
    action: "create",
    actor_id: auth.userId,
    summary: `Requisito ${parsed.data.codice} creato.`,
    payload: { natura: parsed.data.natura },
  });
  return { success: true, id: String(data.id) };
}

export async function eccezioneRequisitoFornitoreAction(
  raw: unknown
): Promise<{ success: true } | Errore> {
  const parsed = z
    .object({
      fornitoreId: uuidSchema,
      requisitoId: uuidSchema,
      modalita: z.enum(["aggiunto", "escluso", "nessuna"]),
    })
    .safeParse(raw);
  if (!parsed.success) return { success: false, error: "Eccezione non valida." };
  const auth = await richiediAmministrazione();
  const supabase = await createClient();
  const ora = new Date().toISOString();
  const { error: chiudiError } = await supabase
    .from("fornitori_requisiti_eccezioni")
    .update({ deleted_at: ora, deleted_by: auth.userId, updated_by: auth.userId })
    .eq("fornitore_id", parsed.data.fornitoreId)
    .eq("requisito_id", parsed.data.requisitoId)
    .is("deleted_at", null);
  if (chiudiError) return { success: false, error: "Eccezione precedente non chiusa." };
  if (parsed.data.modalita !== "nessuna") {
    const { error } = await supabase.from("fornitori_requisiti_eccezioni").insert({
      fornitore_id: parsed.data.fornitoreId,
      requisito_id: parsed.data.requisitoId,
      modalita: parsed.data.modalita,
      created_by: auth.userId,
      updated_by: auth.userId,
    });
    if (error) return { success: false, error: "Eccezione non registrata." };
  }
  return { success: true };
}

export async function pubblicaTestoAbilitazioneAction(
  requisitoId: string
): Promise<{ success: true } | Errore> {
  const parsed = uuidSchema.safeParse(requisitoId);
  if (!parsed.success) return { success: false, error: "Requisito non valido." };
  const auth = await richiediAmministrazione();
  const supabase = await createClient();
  const { data: testo } = await supabase
    .from("fornitori_testi_abilitazione")
    .select("id")
    .eq("requisito_id", parsed.data)
    .is("deleted_at", null)
    .maybeSingle();
  if (!testo) return { success: false, error: "Testo non trovato." };
  const { data: bozza } = await supabase
    .from("fornitori_testi_versioni")
    .select("id, titolo, corpo, numero")
    .eq("testo_id", testo.id)
    .eq("stato", "bozza")
    .is("deleted_at", null)
    .maybeSingle();
  if (!bozza || !String(bozza.corpo).trim()) {
    return { success: false, error: "La bozza è vuota." };
  }
  const { data: precedente } = await supabase
    .from("fornitori_testi_versioni")
    .select("titolo, corpo")
    .eq("testo_id", testo.id)
    .eq("stato", "pubblicata")
    .is("deleted_at", null)
    .order("numero", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (
    precedente &&
    String(precedente.titolo).trim() === String(bozza.titolo).trim() &&
    String(precedente.corpo).trim() === String(bozza.corpo).trim()
  ) {
    return { success: false, error: "Nessuna modifica rispetto alla versione pubblicata." };
  }
  const ora = new Date().toISOString();
  const { error } = await supabase
    .from("fornitori_testi_versioni")
    .update({
      stato: "pubblicata",
      pubblicata_at: ora,
      pubblicata_by: auth.userId,
      updated_by: auth.userId,
    })
    .eq("id", bozza.id);
  if (error) return { success: false, error: "Pubblicazione non riuscita." };
  const { error: nuovaError } = await supabase.from("fornitori_testi_versioni").insert({
    testo_id: testo.id,
    numero: Number(bozza.numero) + 1,
    titolo: String(bozza.titolo),
    corpo: String(bozza.corpo),
    stato: "bozza",
    created_by: auth.userId,
    updated_by: auth.userId,
  });
  if (nuovaError) return { success: false, error: "Nuova bozza non aperta." };
  await writeAuditLog({
    entity_type: "fornitori_testi_versioni",
    entity_id: String(bozza.id),
    action: "pubblica",
    actor_id: auth.userId,
    summary: `Testo di abilitazione versione ${bozza.numero} pubblicato.`,
    payload: { requisitoId: parsed.data },
  });
  return { success: true };
}

export async function salvaBozzaTestoAbilitazioneAction(
  raw: unknown
): Promise<{ success: true } | Errore> {
  const parsed = z
    .object({
      requisitoId: uuidSchema,
      titolo: z.string().trim().min(2).max(160),
      corpo: z.string().trim().max(20000),
    })
    .safeParse(raw);
  if (!parsed.success) return { success: false, error: "Bozza non valida." };
  const auth = await richiediAmministrazione();
  const supabase = await createClient();
  const { data: testo } = await supabase
    .from("fornitori_testi_abilitazione")
    .select("id")
    .eq("requisito_id", parsed.data.requisitoId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!testo) return { success: false, error: "Testo non trovato." };
  const { data: bozza } = await supabase
    .from("fornitori_testi_versioni")
    .select("id")
    .eq("testo_id", testo.id)
    .eq("stato", "bozza")
    .is("deleted_at", null)
    .maybeSingle();
  if (!bozza) return { success: false, error: "Nessuna bozza modificabile." };
  const { error } = await supabase
    .from("fornitori_testi_versioni")
    .update({
      titolo: parsed.data.titolo,
      corpo: parsed.data.corpo,
      updated_by: auth.userId,
    })
    .eq("id", bozza.id);
  if (error) return { success: false, error: "Bozza non salvata." };
  return { success: true };
}

function esitoAvviso(
  esito: Awaited<ReturnType<typeof eseguiNotificaDistribuzione>>
): { success: true; notifica: NotificaRichiestaStato | "gia_registrata" } | Errore {
  if (esito.tipo === "conferma_richiesta") {
    return { success: false, error: MESSAGGIO_CONFERMA_INCERTA };
  }
  if (esito.tipo === "in_corso") return { success: true, notifica: "in_invio" };
  return { success: true, notifica: esito.stato };
}

export async function distribuisciTestoAbilitazioneAction(raw: unknown): Promise<
  { success: true; notifica: NotificaRichiestaStato | "gia_registrata" } | Errore
> {
  const parsed = z
    .object({
      fornitoreId: uuidSchema,
      requisitoId: uuidSchema,
      confermaIncerta: z.boolean().optional(),
    })
    .safeParse(raw);
  if (!parsed.success) return { success: false, error: "Distribuzione non valida." };
  const auth = await richiediAmministrazione();
  const supabase = await createClient();
  const { data: testo } = await supabase
    .from("fornitori_testi_abilitazione")
    .select("id")
    .eq("requisito_id", parsed.data.requisitoId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!testo) return { success: false, error: "Testo non trovato." };
  const { data: pubblicata } = await supabase
    .from("fornitori_testi_versioni")
    .select("id")
    .eq("testo_id", testo.id)
    .eq("stato", "pubblicata")
    .is("deleted_at", null)
    .order("numero", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!pubblicata) return { success: false, error: "Nessuna versione pubblicata da distribuire." };
  const { data: gia } = await supabase
    .from("fornitori_testi_distribuzioni")
    .select("id, notifica_stato")
    .eq("versione_id", pubblicata.id)
    .eq("fornitore_id", parsed.data.fornitoreId)
    .is("deleted_at", null)
    .maybeSingle();
  if (gia) {
    if (gia.notifica_stato === "inviata") {
      return { success: true, notifica: "gia_registrata" };
    }
    return esitoAvviso(
      await eseguiNotificaDistribuzione({
        canale: "testo",
        distribuzioneId: String(gia.id),
        confermaIncerta: parsed.data.confermaIncerta === true,
        messaggio: () => messaggioDistribuzioneTesto(String(gia.id)),
      })
    );
  }
  const { data, error } = await supabase
    .from("fornitori_testi_distribuzioni")
    .insert({
      testo_id: testo.id,
      versione_id: pubblicata.id,
      fornitore_id: parsed.data.fornitoreId,
      notifica_stato: "non_inviata",
      created_by: auth.userId,
      updated_by: auth.userId,
    })
    .select("id")
    .single();
  if (error || !data) return { success: false, error: "Distribuzione non registrata." };
  return esitoAvviso(
    await eseguiNotificaDistribuzione({
      canale: "testo",
      distribuzioneId: String(data.id),
      confermaIncerta: false,
      messaggio: () => messaggioDistribuzioneTesto(String(data.id)),
    })
  );
}

export async function distribuisciLineaGuidaRequisitoAction(raw: unknown): Promise<
  { success: true; notifica: NotificaRichiestaStato | "gia_registrata" } | Errore
> {
  const parsed = z
    .object({
      fornitoreId: uuidSchema,
      lineaGuidaId: uuidSchema,
      confermaIncerta: z.boolean().optional(),
    })
    .safeParse(raw);
  if (!parsed.success) return { success: false, error: "Distribuzione non valida." };
  const auth = await richiediAmministrazione();
  const supabase = await createClient();
  const { data: pubblicata } = await supabase
    .from("haccp_linee_guida_versioni")
    .select("id, numero, titolo")
    .eq("documento_id", parsed.data.lineaGuidaId)
    .eq("stato", "pubblicata")
    .is("deleted_at", null)
    .order("numero", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!pubblicata) {
    return { success: false, error: "La linea guida non ha una versione pubblicata." };
  }
  const { data: gia } = await supabase
    .from("haccp_linee_guida_distribuzioni")
    .select("id, notifica_stato")
    .eq("versione_id", pubblicata.id)
    .eq("fornitore_id", parsed.data.fornitoreId)
    .is("deleted_at", null)
    .maybeSingle();
  let distribuzioneId = gia ? String(gia.id) : "";
  if (!gia) {
    const { data, error } = await supabase
      .from("haccp_linee_guida_distribuzioni")
      .insert({
        documento_id: parsed.data.lineaGuidaId,
        versione_id: pubblicata.id,
        fornitore_id: parsed.data.fornitoreId,
        stato: "registrata",
        notifica_stato: "non_inviata",
        created_by: auth.userId,
        updated_by: auth.userId,
      })
      .select("id")
      .single();
    if (error || !data) return { success: false, error: "Distribuzione non registrata." };
    distribuzioneId = String(data.id);
  } else if (gia.notifica_stato === "inviata") {
    return { success: true, notifica: "gia_registrata" };
  }
  return esitoAvviso(
    await eseguiNotificaDistribuzione({
      canale: "haccp",
      distribuzioneId,
      confermaIncerta: parsed.data.confermaIncerta === true,
      messaggio: () => messaggioDistribuzioneHaccp(distribuzioneId),
    })
  );
}

export async function registraControlloInternoAction(
  raw: unknown
): Promise<{ success: true } | Errore> {
  const parsed = z
    .object({
      fornitoreId: uuidSchema,
      requisitoId: uuidSchema,
      esito: z.enum(["conforme", "non_conforme"]),
      nota: z.string().trim().min(3).max(1000),
    })
    .safeParse(raw);
  if (!parsed.success) return { success: false, error: "Controllo non valido." };
  const auth = await richiediAmministrazione();
  const supabase = await createClient();
  const { data: requisito } = await supabase
    .from("fornitori_requisiti")
    .select("natura")
    .eq("id", parsed.data.requisitoId)
    .is("deleted_at", null)
    .maybeSingle();
  if (requisito?.natura !== "controllo_interno") {
    return { success: false, error: "Il requisito non è un controllo interno." };
  }
  const { error } = await supabase.from("fornitori_controlli_interni").insert({
    requisito_id: parsed.data.requisitoId,
    fornitore_id: parsed.data.fornitoreId,
    esito: parsed.data.esito,
    nota: parsed.data.nota,
    created_by: auth.userId,
  });
  if (error) return { success: false, error: "Controllo non registrato." };
  await writeAuditLog({
    entity_type: "fornitori_controlli_interni",
    entity_id: parsed.data.requisitoId,
    action: "controllo",
    actor_id: auth.userId,
    summary: `Controllo interno ${parsed.data.esito}.`,
    payload: { fornitoreId: parsed.data.fornitoreId, esito: parsed.data.esito },
  });
  return { success: true };
}

export async function registraEventoAbilitazioneAction(
  raw: unknown
): Promise<{ success: true } | Errore> {
  const parsed = z
    .object({
      fornitoreId: uuidSchema,
      tipo: z.enum(["sospensione", "riabilitazione"]),
      motivo: z.string().trim().min(3).max(500),
    })
    .safeParse(raw);
  if (!parsed.success) return { success: false, error: "Evento non valido." };
  const auth = await richiediAmministrazione();
  const supabase = await createClient();
  const { error } = await supabase.from("fornitori_abilitazione_eventi").insert({
    fornitore_id: parsed.data.fornitoreId,
    tipo: parsed.data.tipo,
    motivo: parsed.data.motivo,
    created_by: auth.userId,
  });
  if (error) return { success: false, error: "Evento non registrato." };
  await writeAuditLog({
    entity_type: "fornitori_abilitazione_eventi",
    entity_id: parsed.data.fornitoreId,
    action: parsed.data.tipo,
    actor_id: auth.userId,
    summary:
      parsed.data.tipo === "sospensione"
        ? "Abilitazione fornitore sospesa."
        : "Abilitazione fornitore riattivata.",
    payload: { tipo: parsed.data.tipo },
  });
  return { success: true };
}

export type DocumentoPortaleRiga = {
  versioneId: string;
  titolo: string;
  numero: number;
  corpo: string;
  natura: "consenso_privacy" | "accettazione_contrattuale";
  confermataAt: string | null;
};

export async function listaDocumentiAbilitazionePortaleAction(): Promise<
  { success: true; documenti: DocumentoPortaleRiga[] } | Errore
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
          ? "Il tuo utente non è collegato a un fornitore."
          : "Accesso non consentito.",
    };
  }
  const supabase = await createClient();
  const { data: distribuzioni, error } = await supabase
    .from("fornitori_testi_distribuzioni")
    .select("versione_id, testo_id")
    .eq("fornitore_id", consulta.fornitoreId)
    .is("deleted_at", null);
  if (error) return { success: false, error: "Documenti non disponibili." };
  const versioneIds = [...new Set((distribuzioni ?? []).map((row) => String(row.versione_id)))];
  if (!versioneIds.length) return { success: true, documenti: [] };
  const [versioniRes, attiRes, testiRes] = await Promise.all([
    supabase
      .from("fornitori_testi_versioni")
      .select("id, testo_id, numero, titolo, corpo")
      .in("id", versioneIds)
      .eq("stato", "pubblicata")
      .is("deleted_at", null),
    supabase
      .from("fornitori_testi_atti")
      .select("versione_id, confermata_at, profile_id")
      .eq("fornitore_id", consulta.fornitoreId)
      .eq("profile_id", auth.userId),
    testiResSafe(supabase, (distribuzioni ?? []).map((row) => String(row.testo_id))),
  ]);
  if (versioniRes.error || attiRes.error || testiRes.error) {
    return { success: false, error: "Documenti non disponibili." };
  }
  const naturaPerTesto = new Map(
    (testiRes.data ?? []).map((row) => [String(row.testo_id), comeNatura(String(row.natura))])
  );
  const mia = new Map(
    (attiRes.data ?? []).map((row) => [String(row.versione_id), String(row.confermata_at)])
  );
  const documenti: DocumentoPortaleRiga[] = [];
  for (const row of versioniRes.data ?? []) {
    const natura = naturaPerTesto.get(String(row.testo_id));
    if (natura !== "consenso_privacy" && natura !== "accettazione_contrattuale") continue;
    documenti.push({
      versioneId: String(row.id),
      titolo: String(row.titolo),
      numero: Number(row.numero),
      corpo: String(row.corpo),
      natura,
      confermataAt: mia.get(String(row.id)) ?? null,
    });
  }
  documenti.sort((a, b) => b.numero - a.numero);
  return { success: true, documenti };
}

async function testiResSafe(
  supabase: Awaited<ReturnType<typeof createClient>>,
  testoIds: string[]
) {
  const ids = [...new Set(testoIds)];
  if (!ids.length) return { data: [], error: null };
  const { data: testi, error } = await supabase
    .from("fornitori_testi_abilitazione")
    .select("id, requisito_id")
    .in("id", ids);
  if (error || !testi?.length) return { data: [], error };
  const { data: requisiti, error: requisitiError } = await supabase
    .from("fornitori_requisiti")
    .select("id, natura")
    .in("id", testi.map((row) => String(row.requisito_id)));
  if (requisitiError) return { data: [], error: requisitiError };
  const natura = new Map((requisiti ?? []).map((row) => [String(row.id), String(row.natura)]));
  return {
    data: testi.map((row) => ({
      testo_id: String(row.id),
      natura: natura.get(String(row.requisito_id)) ?? "",
    })),
    error: null,
  };
}

export async function confermaAttoAbilitazioneAction(
  versioneId: string
): Promise<{ success: true } | Errore> {
  const parsed = uuidSchema.safeParse(versioneId);
  if (!parsed.success) return { success: false, error: "Documento non valido." };
  const { auth } = await requireAreaAccess("area-fornitori");
  const soggetto = await soggettoAccessoFornitore();
  if (!soggetto) return { success: false, error: "Accesso richiesto." };
  const consulta = consultaLineeGuidaFornitore(soggetto);
  if (!consulta.ok) return { success: false, error: "Fornitore non collegato." };
  const supabase = await createClient();
  const { data: versione } = await supabase
    .from("fornitori_testi_versioni")
    .select("id, testo_id")
    .eq("id", parsed.data)
    .eq("stato", "pubblicata")
    .is("deleted_at", null)
    .maybeSingle();
  if (!versione) return { success: false, error: "Documento non disponibile." };
  const { data: testo } = await supabase
    .from("fornitori_testi_abilitazione")
    .select("requisito_id")
    .eq("id", versione.testo_id)
    .maybeSingle();
  const { data: requisito } = await supabase
    .from("fornitori_requisiti")
    .select("natura")
    .eq("id", testo?.requisito_id ?? "")
    .maybeSingle();
  const natura = comeNatura(String(requisito?.natura ?? ""));
  if (natura !== "consenso_privacy" && natura !== "accettazione_contrattuale") {
    return { success: false, error: "Questo documento non si conferma con questo atto." };
  }
  const { error } = await supabase.from("fornitori_testi_atti").insert({
    fornitore_id: consulta.fornitoreId,
    profile_id: auth.userId,
    testo_id: versione.testo_id,
    versione_id: versione.id,
    atto: natura,
    created_by: auth.userId,
  });
  if (error) {
    if (String(error.message).includes("duplicate")) {
      return { success: false, error: "Hai già confermato questa versione." };
    }
    return { success: false, error: "Conferma non registrata." };
  }
  await writeAuditLog({
    entity_type: "fornitori_testi_atti",
    entity_id: String(versione.id),
    action: natura,
    actor_id: auth.userId,
    summary: `${etichettaNaturaRequisito(natura)} registrata sulla versione.`,
    payload: { fornitoreId: consulta.fornitoreId, versioneId: String(versione.id) },
  });
  return { success: true };
}
